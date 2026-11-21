import { DEFAULT_PROTOCOL_PARAMETERS, UTxO } from "@meshsdk/core";
import { Address } from "@meshsdk/core-cst";

import type { TxSigners } from "../../src/tx-builder";
import {
  mint,
  requiredSigners,
  spend,
  toUtxo,
  TxBuilder,
  TxBuildError,
  TxError,
} from "../../src/tx-builder";
import {
  itemDepth,
  MAX_NATIVE_DEPTH,
  MAX_TX_BYTES,
} from "../../src/tx-builder/tx-scan";
import { countedKeys } from "../../src/tx-builder/witnesses";
import * as cbor from "./cbor-util";
import { caught } from "./plan/plan-emulator-util";
import { ADA, alice, bob, payTo, stepSetup } from "./plan/run-util";

/*
 * Where the signers of a transaction are read (`requiredSigners`, `fromCbor`, a step given built
 * to `builder.plan`, `plan.add` and `replan`), a native script it runs whose keys this library
 * does not read is refused, NATIVE_SCRIPT_UNREAD, with the reason, the hash and the out ref: the
 * list of who must sign would be short of its keys. One at the bound is read, its keys listed.
 */

const params = { ...DEFAULT_PROTOCOL_PARAMETERS };
const offline = () => new TxBuilder({ network: "preprod", params });

/** A key no input needs: only the script names it */
const KEY = "5a".repeat(28);
const sig = (keyHash = KEY) => cbor.arr(cbor.uint(0), cbor.bytes(keyHash));
/** `all` around `inner` `levels` times */
const allAround = (levels: number, inner: string) =>
  "820181".repeat(levels) + inner;
/** `all` of `count` keys, none of them KEY */
const keysOf = (count: number) =>
  `8201${cbor.head(4, count)}${Array.from({ length: count }, (_, i) =>
    sig((i + 1).toString(16).padStart(56, "0")),
  ).join("")}`;

type Reason = "depth" | "size" | "form";
/** `all` around a key 255 times: 512 levels as the walk counts `[0, script]` */
const AT_BOUND = allAround(255, sig());
/** Native scripts whose keys are not read, as the item after the language 0, and why */
const UNREAD: [string, string, Reason][] = [
  ["all around a key 511 times, 1 024 levels", allAround(511, sig()), "depth"],
  ["all around a key 512 times, 1 026 levels", allAround(512, sig()), "depth"],
  [
    "all of a key and of all around all [] 511 times, 1 027 levels",
    `820182${sig()}${allAround(511, "820180")}`,
    "depth",
  ],
  ["all of 520 keys, longer than a transaction", keysOf(520), "size"],
  [
    "a key hash written in pieces",
    cbor.arr(cbor.uint(0), cbor.chunkedBytes(KEY, 14)),
    "form",
  ],
];

/** The reason in the words of the message */
const WORDS: Record<Reason, string> = {
  depth: `it nests deeper than the ${MAX_NATIVE_DEPTH} levels`,
  size: `it is longer than the ${MAX_TX_BYTES} bytes of a transaction`,
  form: "it is in a form this library does not read",
};

/** The hash of a native script: blake2b-224 of its language 0 and its bytes */
const hashOf = (native: string) => cbor.blake(`00${native}`, 28);

const txOf = (i: number) => "ee" + i.toString(16).padStart(62, "0");

/** A UTxO at `address` that holds `scriptRef`, by default the native script as `[0, script]` */
const holderOf = (
  native: string,
  address: string,
  i = 1,
  scriptRef = `8200${native}`,
): UTxO => ({
  input: { txHash: txOf(i), outputIndex: 0 },
  output: {
    address,
    amount: [{ unit: "lovelace", quantity: "5000000" }],
    scriptRef,
  },
});

/** The key UTxO the transaction spends, of no payer of a plan */
const SPENT: UTxO = {
  input: { txHash: txOf(9), outputIndex: 0 },
  output: {
    address: alice,
    amount: [{ unit: "lovelace", quantity: "50000000" }],
  },
};

/** The CBOR of a transaction unspent output, written by hand: no decoder reads its script */
const cborOf = (utxo: UTxO) =>
  cbor.arr(
    cbor.arr(cbor.bytes(utxo.input.txHash), cbor.uint(utxo.input.outputIndex)),
    cbor.map(
      [
        cbor.uint(0),
        cbor.bytes(Address.fromBech32(utxo.output.address).toBytes()),
      ],
      [cbor.uint(1), cbor.uint(Number(utxo.output.amount[0]!.quantity))],
      [cbor.uint(3), `d818${cbor.bytes(utxo.output.scriptRef!)}`],
    ),
  );

const input = (utxo: UTxO) =>
  cbor.arr(cbor.bytes(utxo.input.txHash), cbor.uint(utxo.input.outputIndex));

/**
 * A transaction that mints a token under `policy`: it spends `spends`, reads `reads`, and pays
 * one output to alice; its witness set holds the native scripts `attached`
 */
const minting = (
  policy: string,
  spends: UTxO[],
  reads: UTxO[],
  attached: string[] = [],
) =>
  cbor.tx(
    cbor.map(
      [cbor.uint(0), cbor.arr(...spends.map(input))],
      [
        cbor.uint(1),
        cbor.arr(
          cbor.map(
            [cbor.uint(0), cbor.bytes(Address.fromBech32(alice).toBytes())],
            [cbor.uint(1), cbor.uint(3_000_000)],
          ),
        ),
      ],
      [cbor.uint(2), cbor.uint(1_000_000)],
      [cbor.uint(9), cbor.map([cbor.bytes(policy), cbor.map(["40", "01"])])],
      ...(reads.length > 0
        ? [[cbor.uint(18), cbor.arr(...reads.map(input))] as [string, string]]
        : []),
    ),
    attached.length > 0
      ? cbor.map([cbor.uint(1), cbor.arr(...attached)])
      : cbor.map(),
  );

/** Checks a refusal: its code, its details, and a message that names them and quotes no byte */
const expectUnread = (
  error: unknown,
  native: string,
  reason: Reason,
  holder: UTxO,
  step?: string,
) => {
  expect(TxError.is(error, "NATIVE_SCRIPT_UNREAD")).toBe(true);
  const refused = error as TxBuildError<"NATIVE_SCRIPT_UNREAD">;
  const scriptHash = hashOf(native);
  expect(refused.details).toEqual({
    scriptHash,
    outRef: { txHash: holder.input.txHash, outputIndex: 0 },
    reason,
  });
  const { message } = refused;
  if (step !== undefined)
    expect(message.startsWith(`step ${JSON.stringify(step)}: `)).toBe(true);
  expect(message).toContain(`the native script ${scriptHash}`);
  expect(message).toContain(`${holder.input.txHash}#0`);
  expect(message).toContain("its keys cannot be listed");
  expect(message).toContain(WORDS[reason]);
  // None of its bytes: neither the key it names nor a piece of the script
  expect(message).not.toContain(KEY.slice(0, 16));
  expect(message).not.toContain(native.slice(0, 24));
};

/** How many native scripts the signers list, and whether the key the script names is counted */
const listed = (signers: TxSigners) => [
  signers.nativeScripts.length,
  countedKeys(signers).includes(KEY),
];

/** A plan whose one step the ledger refused, which `replan` replaces */
const refusedStep = async () => {
  const ctx = await stepSetup("scalus", { funds: [100n * ADA, 7n * ADA] });
  const voucher = ctx.funded[1]!.input;
  const isVoucher = (utxo: { txHash: string; outputIndex: number }) =>
    utxo.txHash === voucher.txHash && utxo.outputIndex === voucher.outputIndex;
  const old = await ctx.builder.plan(
    { b: [payTo(bob, 2n * ADA), spend.pubKey({ utxo: ctx.funded[1]! })] },
    { id: "order", payer: ctx.wallet, canSelect: (utxo) => !isVoucher(utxo) },
  );
  await old.sign();
  // Another transaction took the voucher
  ctx.emulator.removeUtxos([voucher]);
  expect((await caught(old.run())).code).toBe("REJECTED");
  return { ...ctx, old };
};

describe("a native script whose keys this library does not read, where the signers of a transaction are read", () => {
  it("shapes: one at the bound; past it in depth, the forms of a native script past the bound; longer than a transaction; in another form", () => {
    expect(itemDepth(Buffer.from(`8200${AT_BOUND}`, "hex"))).toBe(
      MAX_NATIVE_DEPTH,
    );
    expect(toUtxo(holderOf(AT_BOUND, alice)).script!.type).toBe("native");
    for (const [name, native, reason] of UNREAD) {
      const { type } = toUtxo(holderOf(native, alice)).script!;
      expect([name, type]).toEqual([
        name,
        reason === "depth" ? "native" : "unknown",
      ]);
      if (reason === "depth")
        expect(itemDepth(Buffer.from(`8200${native}`, "hex"))).toBeGreaterThan(
          MAX_NATIVE_DEPTH,
        );
      if (reason === "size")
        expect(native.length / 2).toBeGreaterThan(MAX_TX_BYTES);
    }
  });

  it.each(UNREAD)(
    "refuses one %s through requiredSigners and fromCbor, held by a reference input or by a spent input, its UTxO given in each form or read through the provider",
    async (_, native, reason) => {
      const holder = holderOf(native, alice);
      const policy = hashOf(native);
      const reads = minting(policy, [SPENT], [holder]);
      const spends = minting(policy, [SPENT, holder], []);
      for (const tx of [reads, spends]) {
        // A UTxO in CBOR longer than a transaction is refused as no UTxO before it is read
        const forms =
          reason === "size"
            ? [holder, toUtxo(holder)]
            : [holder, cborOf(holder), toUtxo(holder)];
        for (const form of forms) {
          expectUnread(
            await caught(
              Promise.resolve().then(() => requiredSigners(tx, [SPENT, form])),
            ),
            native,
            reason,
            holder,
          );
          expectUnread(
            await caught(offline().fromCbor(tx, { knownUtxos: [SPENT, form] })),
            native,
            reason,
            holder,
          );
        }
        // Read through the provider, past knownUtxos
        const provider = {
          fetchUTxOs: async (hash: string) =>
            hash === holder.input.txHash ? [holder] : [],
          fetchProtocolParameters: async () => params,
        };
        expectUnread(
          await caught(
            new TxBuilder({
              network: "preprod",
              params,
              provider: provider as never,
            }).fromCbor(tx, { knownUtxos: [SPENT] }),
          ),
          native,
          reason,
          holder,
        );
      }
      // A transaction that does not run it reads nothing of it
      const other = minting("ab".repeat(28), [SPENT], [holder]);
      expect(listed(requiredSigners(other, [SPENT, holder]))).toEqual([
        0,
        false,
      ]);
    },
  );

  it.each(UNREAD)(
    "refuses one %s in a step given built, the step named first: builder.plan, plan.add, replan",
    async (_, native, reason) => {
      const holder = holderOf(native, alice);
      const tx = minting(hashOf(native), [SPENT], [holder]);
      const knownUtxos = [SPENT, holder];
      const { builder, wallet } = await stepSetup("scalus", {
        funds: [100n * ADA],
      });
      expectUnread(
        await caught(
          builder.plan({ given: tx }, { payer: wallet, knownUtxos }),
        ),
        native,
        reason,
        holder,
        "given",
      );
      const plan = await builder.plan(
        { a: payTo(bob, 2n * ADA) },
        { payer: wallet, knownUtxos },
      );
      expectUnread(
        await caught(plan.add({ given: tx })),
        native,
        reason,
        holder,
        "given",
      );
      expect(plan.steps.map((step) => step.name)).toEqual(["a"]);
      const { old } = await refusedStep();
      expectUnread(
        await caught(
          old.replan({ id: "order:2", steps: { given: tx }, knownUtxos }),
        ),
        native,
        reason,
        holder,
        "given",
      );
      expect(old.replacedBy).toBeUndefined();
    },
    60_000,
  );

  it("reads one at the bound, its keys listed: requiredSigners, fromCbor, a step given built", async () => {
    const holder = holderOf(AT_BOUND, alice);
    const tx = minting(hashOf(AT_BOUND), [SPENT], [holder]);
    const knownUtxos = [SPENT, holder];
    expect(listed(requiredSigners(tx, knownUtxos))).toEqual([1, true]);
    expect(
      listed((await offline().fromCbor(tx, { knownUtxos })).signers),
    ).toEqual([1, true]);
    const { builder, wallet } = await stepSetup("scalus", {
      funds: [100n * ADA],
    });
    const plan = await builder.plan(
      { given: tx },
      { payer: wallet, knownUtxos },
    );
    expect(listed(plan.step("given").signers)).toEqual([1, true]);
  }, 60_000);

  it("reads one held again where its keys are read: a reference input that holds it in another framing beside one that holds it as `[0, script]`", async () => {
    // `[0, script]` with its array head in two bytes: not written back the same, so `unknown`
    const framed = holderOf(AT_BOUND, alice, 2, `980200${AT_BOUND}`);
    expect(toUtxo(framed).script!.type).toBe("unknown");
    const holder = holderOf(AT_BOUND, alice);
    const policy = hashOf(AT_BOUND);
    const both = minting(policy, [SPENT], [holder, framed]);
    expect(listed(requiredSigners(both, [SPENT, holder, framed]))).toEqual([
      1,
      true,
    ]);
    expect(
      listed(
        (
          await offline().fromCbor(both, {
            knownUtxos: [SPENT, holder, framed],
          })
        ).signers,
      ),
    ).toEqual([1, true]);
    // Alone, it is one this library does not read
    expectUnread(
      await caught(
        Promise.resolve().then(() =>
          requiredSigners(minting(policy, [SPENT], [framed]), [SPENT, framed]),
        ),
      ),
      AT_BOUND,
      "form",
      framed,
    );
  });

  it("reads a native script of the witness set past the bound, its keys listed, as the value decoder reads it; one past the bounds of a transaction refuses the transaction", async () => {
    // `all` around a key 256 times: 514 levels as `[0, script]` would count them
    const deeper = allAround(256, sig());
    expect(itemDepth(Buffer.from(`8200${deeper}`, "hex"))).toBeGreaterThan(
      MAX_NATIVE_DEPTH,
    );
    const tx = minting(hashOf(deeper), [SPENT], [], [deeper]);
    expect(listed(requiredSigners(tx, [SPENT]))).toEqual([1, true]);
    expect(
      listed((await offline().fromCbor(tx, { knownUtxos: [SPENT] })).signers),
    ).toEqual([1, true]);
    const { builder, wallet } = await stepSetup("scalus", {
      funds: [100n * ADA],
    });
    const plan = await builder.plan(
      { given: tx },
      { payer: wallet, knownUtxos: [SPENT] },
    );
    expect(listed(plan.step("given").signers)).toEqual([1, true]);
    // Past the bounds within which a transaction is read: fromCbor refuses the transaction, as
    // a plan does; requiredSigners reads it, the script's keys listed
    const past = allAround(511, sig());
    const refused = minting(hashOf(past), [SPENT], [], [past]);
    const error = await caught(
      offline().fromCbor(refused, { knownUtxos: [SPENT] }),
    );
    expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
    expect((error as TxError).message).toMatch(/^invalid tx: /);
    expect(listed(requiredSigners(refused, [SPENT]))).toEqual([1, true]);
  }, 60_000);

  it("names the reason in the refusal of a build that names one nested past the bound as a { reference }: its UTxO, or its out ref with knownUtxos", async () => {
    for (const [name, native, reason] of UNREAD) {
      const holder = holderOf(native, alice);
      const payer = { changeAddress: alice, utxos: [SPENT] };
      for (const [how, part, options] of [
        [
          "a UTxO",
          () =>
            mint.native({ script: { reference: holder }, assets: { "": 1n } }),
          { payer },
        ],
        [
          "an out ref",
          () =>
            mint.native({
              script: { reference: holder.input },
              policyId: hashOf(native),
              assets: { "": 1n },
            }),
          { payer, knownUtxos: [holder] },
        ],
      ] as const) {
        const error = await caught(
          Promise.resolve().then(() => offline().build([part()], options)),
        );
        expect([name, how, (error as TxError).code]).toEqual([
          name,
          how,
          "INVALID_SCRIPT",
        ]);
        expect((error as TxError).message).toContain(
          reason === "depth"
            ? `${holder.input.txHash}#0 holds a native script whose keys this library does not read: ${WORDS.depth}`
            : `${holder.input.txHash}#0 holds a reference script this library cannot read`,
        );
      }
    }
  });
});
