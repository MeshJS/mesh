import { DEFAULT_PROTOCOL_PARAMETERS, UTxO } from "@meshsdk/core";
import { Address, scriptHashToRewardAddress } from "@meshsdk/core-cst";

import type { TxSigners } from "../../src/tx-builder";
import {
  certificate,
  mint,
  proposal,
  requiredSigners,
  spend,
  toUtxo,
  TxBuilder,
  TxBuildError,
  TxError,
  vote,
  withdrawal,
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
 * list of who must sign would be short of its keys. One at the bound is read, its keys listed. A
 * native script is known in every framing of `[0, script]` the ledger reads, and under tag 24;
 * a script the transaction runs that is found nowhere is refused too while a UTxO it spends or
 * reads holds a reference script this library does not read, whatever its bytes.
 */

const params = { ...DEFAULT_PROTOCOL_PARAMETERS };
const offline = () => new TxBuilder({ network: "preprod", params });

/** A key no input needs: only the script names it */
const KEY = "5a".repeat(28);
const sig = (keyHash = KEY) => cbor.arr(cbor.uint(0), cbor.bytes(keyHash));
/** A native script of the witness set that names another key */
const OTHER = cbor.arr(cbor.uint(0), cbor.bytes("cd".repeat(28)));
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
/** What reading a native script found, in the words of a message */
const WORDS = {
  depth: `it nests deeper than the ${MAX_NATIVE_DEPTH} levels to which this library reads the keys of a native script`,
  size: `it is longer than the ${MAX_TX_BYTES} bytes of a transaction, the most this library reads of a native script`,
  notNative:
    "what follows its language 0 is not a native script as the ledger reads one, or names a key hash written in pieces",
  tag24: "it is under tag 24, as a byte string",
  indefinite: "its array [0, script] is of indefinite length",
  longHead: "the head of its array [0, script] is written longer than needed",
  longLanguage: "its language 0 is written longer than needed",
  stated: "the hash given for it is not the hash of its bytes",
  notOneItem: "what follows its language 0 is not one well-formed CBOR item",
  noScript: "its bytes are not [language, script] in a form this library reads",
};

/** Native scripts whose keys are not read, as the item after the language 0, why, and its words */
const UNREAD: [string, string, Reason, string][] = [
  [
    "all around a key 511 times, 1 024 levels",
    allAround(511, sig()),
    "depth",
    WORDS.depth,
  ],
  [
    "all around a key 512 times, 1 026 levels",
    allAround(512, sig()),
    "depth",
    WORDS.depth,
  ],
  [
    "all of a key and of all around all [] 511 times, 1 027 levels",
    `820182${sig()}${allAround(511, "820180")}`,
    "depth",
    WORDS.depth,
  ],
  [
    "all of 520 keys, longer than a transaction",
    keysOf(520),
    "size",
    WORDS.size,
  ],
  [
    "a key hash written in pieces",
    cbor.arr(cbor.uint(0), cbor.chunkedBytes(KEY, 14)),
    "form",
    WORDS.notNative,
  ],
];

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

/**
 * Checks a refusal: its code, its details, and a message that names them, ends with `words`, what
 * reading the script found, and quotes no byte
 */
const expectUnread = (
  error: unknown,
  native: string,
  reason: Reason,
  words: string,
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
  expect(message.endsWith(`, and its keys cannot be listed: ${words}`)).toBe(
    true,
  );
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
    async (_, native, reason, words) => {
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
            words,
            holder,
          );
          expectUnread(
            await caught(offline().fromCbor(tx, { knownUtxos: [SPENT, form] })),
            native,
            reason,
            words,
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
          words,
          holder,
        );
      }
      // A transaction that does not run it, whose script is in its witness set, reads nothing of
      // it
      const other = minting(hashOf(OTHER), [SPENT], [holder], [OTHER]);
      expect(listed(requiredSigners(other, [SPENT, holder]))).toEqual([
        1,
        false,
      ]);
    },
  );

  it.each(UNREAD)(
    "refuses one %s in a step given built, the step named first: builder.plan, plan.add, replan",
    async (_, native, reason, words) => {
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
        words,
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
        words,
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
        words,
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
      WORDS.longHead,
      framed,
    );
  });

  it("reads a native script of the witness set past the bound, its keys listed, as the value decoder reads it; one past the depth of a transaction refuses the transaction, in requiredSigners too", async () => {
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
    // Past the depth within which a transaction is read: fromCbor refuses the transaction, as a
    // plan does, and requiredSigners refuses it the same way
    const past = allAround(511, sig());
    const refused = minting(hashOf(past), [SPENT], [], [past]);
    const error = await caught(
      offline().fromCbor(refused, { knownUtxos: [SPENT] }),
    );
    expect(TxError.is(error, "INVALID_OPTION")).toBe(true);
    expect((error as TxError).message).toBe(
      "invalid tx: the transaction nests its items deeper than the 1024 levels this library reads",
    );
    const again = await caught(
      Promise.resolve().then(() => requiredSigners(refused, [SPENT])),
    );
    expect([(again as TxError).code, (again as TxError).message]).toEqual([
      "INVALID_OPTION",
      (error as TxError).message,
    ]);
    expect((again as TxBuildError<"INVALID_OPTION">).details).toEqual(
      (error as TxBuildError<"INVALID_OPTION">).details,
    );
  }, 60_000);

  it("names the reason in the refusal of a build that names one nested past the bound as a { reference }: its UTxO, or its out ref with knownUtxos", async () => {
    for (const [name, native, , words] of UNREAD) {
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
          `${holder.input.txHash}#0 holds a native script whose keys this library does not read: ${words}`,
        );
      }
    }
  });
});

/** `all` around a key 3 times: a native script whose keys are read in the form `[0, script]` */
const READ = allAround(3, sig());
/** A native script whose keys are not read in any framing: a key hash written in pieces */
const PIECES = cbor.arr(cbor.uint(0), cbor.chunkedBytes(KEY, 14));

/**
 * The CBOR of a reference script, its native script framed as the ledger reads it, why, and what
 * reading it found
 */
const FRAMINGS: [string, string, string, Reason, string][] = [
  [
    "[_ 0, script] of a readable script",
    `9f00${READ}ff`,
    READ,
    "form",
    WORDS.indefinite,
  ],
  [
    "[_ 0, script] of an unreadable script",
    `9f00${PIECES}ff`,
    PIECES,
    "form",
    `${WORDS.indefinite}; ${WORDS.notNative}`,
  ],
  [
    "[_ 0, script] of one longer than a transaction",
    `9f00${keysOf(520)}ff`,
    keysOf(520),
    "size",
    WORDS.size,
  ],
  [
    "tag 24 around [0, script]",
    `d818${cbor.bytes(`8200${READ}`)}`,
    READ,
    "form",
    WORDS.tag24,
  ],
  [
    "tag 24 around [_ 0, script], the bytes in pieces",
    `d818${cbor.chunkedBytes(`9f00${READ}ff`, 16)}`,
    READ,
    "form",
    `${WORDS.tag24}; ${WORDS.indefinite}`,
  ],
  [
    "[0, script], its head and its language in 8 bytes",
    `9b0000000000000002${cbor.uint64(0)}${READ}`,
    READ,
    "form",
    `${WORDS.longHead}; ${WORDS.longLanguage}`,
  ],
];

/** The sig script of KEY, as a provider may give it without its language */
const SIG = sig();
/** A hash the transactions run that is found nowhere */
const RUNS = "ab".repeat(28);

/**
 * Reference scripts this library does not read, whatever their bytes look like: the bytes, the
 * hash given for them, the hash the transaction runs, and what reading them found
 */
const NOT_READ: [string, string, string | undefined, string, string][] = [
  [
    "a sig script given without its language",
    SIG,
    undefined,
    hashOf(SIG),
    WORDS.notNative,
  ],
  [
    "a sig script without its language under tag 24",
    `d818${cbor.bytes(SIG)}`,
    undefined,
    hashOf(SIG),
    `${WORDS.tag24}; ${WORDS.notNative}`,
  ],
  [
    "a sig script without its language, its hash given",
    SIG,
    hashOf(SIG),
    hashOf(SIG),
    `${WORDS.stated}; ${WORDS.notNative}`,
  ],
  [
    "a sig script without its language under tag 24, its hash given",
    `d818${cbor.bytes(SIG)}`,
    hashOf(SIG),
    hashOf(SIG),
    `${WORDS.tag24}; ${WORDS.stated}; ${WORDS.notNative}`,
  ],
  ["[0, 0]", "820000", undefined, RUNS, WORDS.notNative],
  ["[0, h'']", "820040", undefined, RUNS, WORDS.notNative],
  [
    "[0, a byte string of 32 bytes]",
    `8200${cbor.bytes("cd".repeat(32))}`,
    undefined,
    RUNS,
    WORDS.notNative,
  ],
  [
    "[0, a key hash in pieces]",
    `8200${cbor.chunkedBytes(KEY, 14)}`,
    undefined,
    RUNS,
    WORDS.notNative,
  ],
  [
    "another native script under the hash run",
    `8200${OTHER}`,
    RUNS,
    RUNS,
    WORDS.stated,
  ],
  [
    "another native script in [_ 0, script] under the hash run",
    `9f00${OTHER}ff`,
    RUNS,
    RUNS,
    `${WORDS.indefinite}; ${WORDS.stated}`,
  ],
  [
    "[0, 0] under the hash run",
    "820000",
    RUNS,
    RUNS,
    `${WORDS.stated}; ${WORDS.notNative}`,
  ],
];

/** Checks the refusal of a script the transaction runs that is found nowhere this library reads */
const expectUnfound = (
  error: unknown,
  scriptHash: string,
  holder: UTxO,
  words: string,
  more = 0,
  step?: string,
) => {
  expect(TxError.is(error, "NATIVE_SCRIPT_UNREAD")).toBe(true);
  const refused = error as TxBuildError<"NATIVE_SCRIPT_UNREAD">;
  expect(refused.details).toEqual({
    scriptHash,
    outRef: { txHash: holder.input.txHash, outputIndex: 0 },
    reason: "form",
  });
  const { message } = refused;
  if (step !== undefined)
    expect(message.startsWith(`step ${JSON.stringify(step)}: `)).toBe(true);
  expect(message).toContain(
    `the transaction runs the script ${scriptHash}, which this library finds neither in its witness set nor among the reference scripts it reads, and the UTxO ${holder.input.txHash}#0 holds a reference script this library does not read (${words}): if that is the script, and a native one, who must sign cannot be listed`,
  );
  if (more > 0)
    expect(message).toContain(
      `; ${more} more UTxO${more === 1 ? "" : "s"} it spends or reads hold`,
    );
  else expect(message).not.toContain("more UTxO");
  expect(message).not.toContain(KEY.slice(0, 16));
  expect(message).not.toContain(holder.output.scriptRef!.slice(0, 24));
};

/** Each path that reads the signers of `tx`, given `known`: its outcome, or the error it throws */
const readings = async (tx: string, known: (UTxO | string)[]) => {
  const outcome = async (read: () => Promise<TxSigners> | TxSigners) => {
    try {
      return listed(await read());
    } catch (error) {
      return error;
    }
  };
  const { builder, wallet } = await stepSetup("scalus", {
    funds: [100n * ADA],
  });
  return {
    requiredSigners: await outcome(() => requiredSigners(tx, known)),
    fromCbor: await outcome(
      async () => (await offline().fromCbor(tx, { knownUtxos: known })).signers,
    ),
    step: await outcome(
      async () =>
        (
          await builder.plan(
            { given: tx },
            { payer: wallet, knownUtxos: known as UTxO[] },
          )
        ).step("given").signers,
    ),
  };
};

describe("every framing of a native reference script the ledger reads, and a reference script this library does not read", () => {
  it.each(FRAMINGS)(
    "refuses one in %s that the transaction runs, held by a reference input or a spent input, its UTxO in each form: requiredSigners, fromCbor, a step given built",
    async (_, scriptRef, native, reason, words) => {
      const holder = holderOf(native, alice, 1, scriptRef);
      expect(toUtxo(holder).script!.type).toBe("unknown");
      const policy = hashOf(native);
      for (const tx of [
        minting(policy, [SPENT], [holder]),
        minting(policy, [SPENT, holder], []),
      ]) {
        const forms =
          reason === "size"
            ? [holder, toUtxo(holder)]
            : [holder, cborOf(holder), toUtxo(holder)];
        for (const form of forms) {
          const read = await readings(tx, [SPENT, form as UTxO]);
          expectUnread(read.requiredSigners, native, reason, words, holder);
          expectUnread(read.fromCbor, native, reason, words, holder);
          expectUnread(read.step, native, reason, words, holder, "given");
        }
      }
      // A transaction that does not run it, whose script is in its witness set, reads nothing of
      // it; one that holds it again where its keys are read lists them
      const other = minting(hashOf(OTHER), [SPENT], [holder], [OTHER]);
      expect(await readings(other, [SPENT, holder])).toEqual({
        requiredSigners: [1, false],
        fromCbor: [1, false],
        step: [1, false],
      });
      if (reason === "form" && native === READ) {
        const again = holderOf(READ, alice, 3);
        expect(
          await readings(minting(policy, [SPENT], [holder, again]), [
            SPENT,
            holder,
            again,
          ]),
        ).toEqual({
          requiredSigners: [1, true],
          fromCbor: [1, true],
          step: [1, true],
        });
      }
    },
    60_000,
  );

  it("refuses a transaction that runs a script found nowhere, while an input holds bytes that are no reference script at all, the first such UTxO named and the others counted", async () => {
    const junk = holderOf(KEY, alice, 2, "deadbeef");
    expect(toUtxo(junk).script).toEqual({
      type: "unknown",
      scriptRef: "deadbeef",
    });
    const runs = "ab".repeat(28);
    for (const [tx, known] of [
      [minting(runs, [SPENT], [junk]), [SPENT, junk]],
      [minting(runs, [SPENT, junk], []), [SPENT, cborOf(junk)]],
    ] as const) {
      const read = await readings(tx, [...known] as UTxO[]);
      expectUnfound(read.requiredSigners, runs, junk, WORDS.noScript);
      expectUnfound(read.fromCbor, runs, junk, WORDS.noScript);
      expectUnfound(read.step, runs, junk, WORDS.noScript, 0, "given");
    }
    // Three more: a map, `[0, script, 0]`, which is not `[0, script]`, and `[0, script]` with a
    // byte after it, whose bytes after the language are not one item
    const map = holderOf(KEY, alice, 4, "a0");
    const three = holderOf(READ, alice, 5, `8300${READ}00`);
    const after = holderOf(READ, alice, 7, `8200${READ}00`);
    const read = await readings(
      minting(runs, [SPENT, three, map], [junk, after]),
      [SPENT, junk, map, three, after],
    );
    expectUnfound(read.requiredSigners, runs, three, WORDS.noScript, 3);
    expectUnfound(read.fromCbor, runs, three, WORDS.noScript, 3);
    expectUnfound(read.step, runs, three, WORDS.noScript, 3, "given");
    // Alone, the last is named, and so is the hash of the script it holds when the transaction
    // runs it
    for (const policy of [runs, hashOf(READ)]) {
      const alone = await readings(minting(policy, [SPENT], [after]), [
        SPENT,
        after,
      ]);
      expectUnfound(alone.requiredSigners, policy, after, WORDS.notOneItem);
      expectUnfound(alone.fromCbor, policy, after, WORDS.notOneItem);
      expectUnfound(alone.step, policy, after, WORDS.notOneItem, 0, "given");
    }
    // A native script longer than a transaction is not walked: its hash is not known to be that
    // of the script alone, so it may be the one the transaction runs
    const long = holderOf(keysOf(520), alice, 6);
    const bySize = await readings(minting(runs, [SPENT], [long]), [
      SPENT,
      long,
    ]);
    expectUnfound(bySize.requiredSigners, runs, long, WORDS.size);
    expectUnfound(bySize.fromCbor, runs, long, WORDS.size);
    expectUnfound(bySize.step, runs, long, WORDS.size, 0, "given");
  }, 60_000);

  it("reads as now a transaction whose scripts are each found, or that holds no reference script it does not read", async () => {
    const junk = holderOf(KEY, alice, 2, "deadbeef");
    const holder = holderOf(READ, alice);
    // The script it runs in its witness set, or held where it is read, beside the bytes
    for (const [tx, known] of [
      [minting(hashOf(READ), [SPENT], [junk], [READ]), [SPENT, junk]],
      [minting(hashOf(READ), [SPENT], [junk, holder]), [SPENT, junk, holder]],
    ] as const)
      expect(await readings(tx, [...known])).toEqual({
        requiredSigners: [1, true],
        fromCbor: [1, true],
        step: [1, true],
      });
    // The UTxO of the reference input that holds it not given, with none it does not read
    expect(
      listed(
        requiredSigners(minting(hashOf(READ), [SPENT], [holder]), [SPENT]),
      ),
    ).toEqual([0, false]);
  }, 60_000);

  it("reads as now a transaction that runs a script found nowhere beside a canonical script of each language, with no UTxO it does not read", async () => {
    const plutus = (version: number) =>
      holderOf(
        KEY,
        alice,
        10 + version,
        cbor.arr(
          cbor.uint(version),
          cbor.bytes("4d01000033222220051200120011"),
        ),
      );
    const holders = [
      holderOf(READ, alice, 10),
      plutus(1),
      plutus(2),
      plutus(3),
    ];
    expect(holders.map((holder) => toUtxo(holder).script!.type)).toEqual([
      "native",
      "plutus",
      "plutus",
      "plutus",
    ]);
    for (const [tx, known] of [
      [minting(RUNS, [SPENT], holders), [SPENT, ...holders]],
      [minting(RUNS, [SPENT, ...holders], []), [SPENT, ...holders.map(cborOf)]],
    ] as const)
      expect(await readings(tx, [...known] as UTxO[])).toEqual({
        requiredSigners: [0, false],
        fromCbor: [0, false],
        step: [0, false],
      });
  }, 60_000);

  it.each(NOT_READ)(
    "refuses a transaction that runs a script found nowhere while an input or a reference input holds %s, its UTxO given in each form or the provider's answer: requiredSigners, fromCbor, builder.plan, plan.add",
    async (_, scriptRef, scriptHash, runs, words) => {
      const given = holderOf(KEY, alice, 1, scriptRef);
      const holder: UTxO =
        scriptHash === undefined
          ? given
          : { ...given, output: { ...given.output, scriptHash } };
      expect(toUtxo(holder).script!.type).toBe("unknown");
      // The provider answers the holder's out ref while `answer` is set
      let answer: UTxO | undefined;
      const { builder, wallet } = await stepSetup("scalus", {
        funds: [100n * ADA],
        hooks: {
          fetchUTxOs: (forward, txHash: string) =>
            answer !== undefined && txHash === answer.input.txHash
              ? Promise.resolve([answer])
              : forward(txHash),
        },
      });
      const forms: [string, (UTxO | string)[]][] = [
        ["Mesh", [SPENT, holder]],
        ...(scriptHash === undefined
          ? [["CBOR", [SPENT, cborOf(holder)]] as [string, string[]]]
          : []),
        ["the provider's", [SPENT]],
      ];
      for (const [form, known] of forms) {
        answer = form === "the provider's" ? holder : undefined;
        const knownUtxos = known as UTxO[];
        const plan = await builder.plan(
          { a: payTo(bob, 2n * ADA) },
          { payer: wallet, knownUtxos },
        );
        for (const tx of [
          minting(runs, [SPENT], [holder]),
          minting(runs, [SPENT, holder], []),
        ]) {
          if (form !== "the provider's")
            expectUnfound(
              await caught(
                Promise.resolve().then(() => requiredSigners(tx, known)),
              ),
              runs,
              holder,
              words,
            );
          expectUnfound(
            await caught(builder.fromCbor(tx, { knownUtxos })),
            runs,
            holder,
            words,
          );
          expectUnfound(
            await caught(
              builder.plan({ given: tx }, { payer: wallet, knownUtxos }),
            ),
            runs,
            holder,
            words,
            0,
            "given",
          );
          expectUnfound(
            await caught(plan.add({ given: tx })),
            runs,
            holder,
            words,
            0,
            "given",
          );
          expect(plan.steps.map((step) => step.name)).toEqual(["a"]);
        }
      }
    },
    60_000,
  );
});

/** `all` around a key 300 times: 602 levels as the walk counts `[0, script]` */
const DEEP = allAround(300, sig());

describe("the words of each reason a native script is not read: what reading it found", () => {
  it.each([
    [
      "an array head in two bytes",
      `980200${READ}`,
      READ,
      "form",
      WORDS.longHead,
    ],
    [
      "the language in two bytes",
      `821800${READ}`,
      READ,
      "form",
      WORDS.longLanguage,
    ],
    [
      "an array of indefinite length",
      `9f00${READ}ff`,
      READ,
      "form",
      WORDS.indefinite,
    ],
    ["tag 24", `d818${cbor.bytes(`8200${READ}`)}`, READ, "form", WORDS.tag24],
    [
      "a key hash written in pieces",
      `8200${PIECES}`,
      PIECES,
      "form",
      WORDS.notNative,
    ],
    [
      "a kind of script the ledger does not read",
      `8200${cbor.arr(cbor.uint(6), cbor.uint(0))}`,
      cbor.arr(cbor.uint(6), cbor.uint(0)),
      "form",
      WORDS.notNative,
    ],
    [
      "CBOR that is not well formed",
      "82009f00",
      "9f00",
      "form",
      WORDS.notOneItem,
    ],
    [
      "an array head in two bytes around one nested past the bound",
      `980200${DEEP}`,
      DEEP,
      "form",
      `${WORDS.longHead}; ${WORDS.depth}`,
    ],
    ["one nested past the bound", `8200${DEEP}`, DEEP, "depth", WORDS.depth],
    [
      "one longer than a transaction",
      `8200${keysOf(520)}`,
      keysOf(520),
      "size",
      WORDS.size,
    ],
  ] as [string, string, string, Reason, string][])(
    "says so of %s, in requiredSigners and fromCbor",
    async (_, scriptRef, native, reason, words) => {
      const holder = holderOf(native, alice, 1, scriptRef);
      const tx = minting(hashOf(native), [SPENT], [holder]);
      expectUnread(
        await caught(
          Promise.resolve().then(() => requiredSigners(tx, [SPENT, holder])),
        ),
        native,
        reason,
        words,
        holder,
      );
      expectUnread(
        await caught(offline().fromCbor(tx, { knownUtxos: [SPENT, holder] })),
        native,
        reason,
        words,
        holder,
      );
    },
  );

  it("says so of a script hash given that is not the hash of its bytes", async () => {
    const holder = holderOf(READ, alice);
    const stated = {
      ...holder,
      output: { ...holder.output, scriptHash: "cd".repeat(28) },
    };
    const tx = minting(hashOf(READ), [SPENT], [stated]);
    expectUnread(
      await caught(
        Promise.resolve().then(() => requiredSigners(tx, [SPENT, stated])),
      ),
      READ,
      "form",
      WORDS.stated,
      holder,
    );
    expectUnread(
      await caught(offline().fromCbor(tx, { knownUtxos: [SPENT, stated] })),
      READ,
      "form",
      WORDS.stated,
      holder,
    );
  });
});

describe("the reason a build refuses a script named as a { reference }, in the same words", () => {
  const payer = { changeAddress: alice, utxos: [SPENT] };
  /** The parts that take a native witness, each naming `source` for the script hash `hash` */
  const parts = (hash: string, source: unknown): [string, () => unknown][] => {
    const locked: UTxO = {
      input: { txHash: txOf(7), outputIndex: 0 },
      output: {
        address: Address.fromBytes(`70${hash}` as never).toBech32(),
        amount: [{ unit: "lovelace", quantity: "9000000" }],
      },
    };
    return [
      [
        "mint",
        () =>
          mint.native({
            script: source as never,
            policyId: hash,
            assets: { "": 1n },
          }),
      ],
      ["spend", () => spend.native({ utxo: locked, script: source as never })],
      [
        "withdrawal",
        () =>
          withdrawal.native({
            rewardAddress: scriptHashToRewardAddress(hash, 0),
            amount: 0n,
            script: source as never,
          }),
      ],
      [
        "certificate",
        () =>
          certificate.stakeDelegation({
            stake: { type: "SCRIPT", value: hash },
            pool: "17".repeat(28),
            witness: { native: source as never },
          }),
      ],
      [
        "vote",
        () =>
          vote({
            voter: { drep: { type: "SCRIPT", value: hash } },
            votes: [
              { action: { txHash: "c".repeat(64), index: 1 }, vote: "abstain" },
            ],
            witness: { native: source as never },
          }),
      ],
      [
        "proposal",
        () =>
          proposal.parameterChange({
            rewardAccount: scriptHashToRewardAddress("55".repeat(28), 0),
            anchor: { url: "https://example.com/p", dataHash: "d".repeat(64) },
            updates: { max_tx_size: 16384 },
            policyHash: hash,
            guardrail: { native: source as never },
          } as never),
      ],
    ];
  };

  it.each([
    ["depth", `8200${DEEP}`, hashOf(DEEP), true, WORDS.depth],
    ["size", `8200${keysOf(520)}`, hashOf(keysOf(520)), true, WORDS.size],
    ["form", `9f00${READ}ff`, hashOf(READ), true, WORDS.indefinite],
    [
      "bytes that are no reference script",
      "deadbeef",
      "ab".repeat(28),
      false,
      WORDS.noScript,
    ],
  ] as [string, string, string, boolean, string][])(
    "names %s in every part, its UTxO given in the part, by out ref with knownUtxos and through the provider, and in a plan's step",
    async (_, scriptRef, hash, native, words) => {
      const holder = holderOf(KEY, alice, 1, scriptRef);
      const said = `${holder.input.txHash}#0 holds ${native ? "a native script whose keys this library does not read" : "a reference script this library cannot read"}: ${words}`;
      const provider = {
        fetchUTxOs: async (txHash: string) =>
          txHash === holder.input.txHash ? [holder] : [],
        fetchProtocolParameters: async () => params,
      };
      const sources: [string, unknown, () => TxBuilder, UTxO[]][] = [
        ["a UTxO", { reference: holder }, offline, []],
        ["an out ref", { reference: holder.input }, offline, [holder]],
        [
          "an out ref read through the provider",
          {
            reference: holder.input,
            scriptHash: hash,
            scriptSize: scriptRef.length / 2,
          },
          () =>
            new TxBuilder({
              network: "preprod",
              params,
              provider: provider as never,
            }),
          [],
        ],
      ];
      for (const [how, source, builder, knownUtxos] of sources)
        for (const [part, make] of parts(hash, source)) {
          const error = await caught(
            Promise.resolve().then(() =>
              builder().build([make() as never], { payer, knownUtxos }),
            ),
          );
          expect([how, part, (error as TxError).code]).toEqual([
            how,
            part,
            "INVALID_SCRIPT",
          ]);
          expect([how, part, (error as TxError).message]).toEqual([
            how,
            part,
            `${part}: ${said}`,
          ]);
        }
      const { builder, wallet } = await stepSetup("scalus", {
        funds: [100n * ADA],
      });
      const [, make] = parts(hash, { reference: holder.input })[0]!;
      const error = await caught(
        Promise.resolve().then(() =>
          builder.plan(
            { s: [make() as never] },
            { payer: wallet, knownUtxos: [holder] },
          ),
        ),
      );
      expect((error as TxError).code).toBe("INVALID_SCRIPT");
      expect((error as TxError).message).toBe(`step "s": mint: ${said}`);
    },
    60_000,
  );
});
