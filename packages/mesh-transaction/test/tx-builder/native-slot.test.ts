import { DEFAULT_PROTOCOL_PARAMETERS, NativeScript } from "@meshsdk/core";
import {
  Cardano,
  CborWriter,
  Crypto,
  HexBlob,
  scriptHashToBech32,
  scriptHashToRewardAddress,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";

import {
  auxiliaryScript,
  certificate,
  keySigner,
  mint,
  output,
  OutputPart,
  proposal,
  requiredSigners,
  spend,
  TxBuilder,
  TxError,
  TxHashRequest,
  Utxo,
  vote,
  withdrawal,
} from "../../src/tx-builder";

/*
 * The slot of a native script's time lock is one the ledger reads, an unsigned integer of 64
 * bits: from 0 to 2^64 - 1 it is taken exactly, never through a Number, and a script given as CBOR
 * keeps its bytes; a negative one, or one past 2^64 - 1, is refused at the part call. The keys the
 * script names and its time lock are read from it exactly wherever it is read.
 */

const KEY = "11".repeat(32);
/** The hash of the key `KEY`, checked in `beforeAll` */
const keyHash = "5ae193abe694a607531e20f85d8358ade9a474a4f45ac4e15e962da1";
/** A key-locked address of another key, which pays */
const payerAddress = Cardano.EnterpriseAddress.fromCredentials(0, {
  type: Cardano.CredentialType.KeyHash,
  hash: "22".repeat(28) as Cardano.Credential["hash"],
})
  .toAddress()
  .toBech32();
const funds: Utxo = {
  txHash: "f".repeat(64),
  outputIndex: 0,
  address: payerAddress,
  value: { lovelace: 100_000_000_000n },
};
const action = { txHash: "2".repeat(64), index: 0 };
const anchor = { url: "https://example.com/a.json", dataHash: "ab".repeat(32) };

/** The CBOR of an integer in its shortest form */
const int = (n: bigint) => new CborWriter().writeInt(n).encodeAsHex();
const nativeHash = (hex: string) =>
  Crypto.blake2b.hash(HexBlob(`00${hex}`), 28).toString();
const sig = `8200581c${keyHash}`;

/** 0, 2^53 + 1 (no Number holds it), 2^64 - 1025, 2^64 - 1024 (a Number rounds it to 2^64), 2^64 - 1 */
const SLOTS = [
  0n,
  2n ** 53n + 1n,
  2n ** 64n - 1025n,
  2n ** 64n - 1024n,
  2n ** 64n - 1n,
];

/** A time lock alone, and `all` of the key and the time lock; as CBOR and as an object */
const formsOf = (kind: "after" | "before", slot: bigint) => {
  const lock = `82${kind === "after" ? "04" : "05"}${int(slot)}`;
  const both = `820182${sig}${lock}`;
  const object: NativeScript = { type: kind, slot: slot.toString() };
  return [
    { name: "CBOR", script: lock as string | NativeScript, cbor: lock },
    { name: "CBOR of all", script: both, cbor: both, key: true },
    { name: "an object", script: object, cbor: lock },
    {
      name: "an object of all",
      script: {
        type: "all",
        scripts: [{ type: "sig", keyHash }, object],
      } as NativeScript,
      cbor: both,
      key: true,
    },
  ];
};

type Made = { part: unknown; spent?: Utxo };
/** Each part that takes a native script, with the UTxO it spends */
const PARTS: [string, (script: string | NativeScript, hash: string) => Made][] =
  [
    [
      "spend.native",
      (script, hash) => {
        const utxo: Utxo = {
          txHash: "e".repeat(64),
          outputIndex: 0,
          address: scriptHashToBech32(hash, undefined, 0),
          value: { lovelace: 10_000_000n },
        };
        return { part: spend.native({ utxo, script }), spent: utxo };
      },
    ],
    [
      "mint.native",
      (script) => ({ part: mint.native({ script, assets: { "41": 1n } }) }),
    ],
    [
      "withdrawal.native",
      (script, hash) => ({
        part: withdrawal.native({
          rewardAddress: scriptHashToRewardAddress(hash, 0),
          amount: 0n,
          script,
        }),
      }),
    ],
    [
      "a certificate's witness",
      (script, hash) => ({
        part: certificate.stakeDeregistration({
          stake: scriptHashToRewardAddress(hash, 0),
          witness: { native: script },
        }),
      }),
    ],
    [
      "a vote's witness",
      (script, hash) => ({
        part: vote({
          voter: { drep: { type: "SCRIPT", value: hash } },
          votes: [{ action, vote: "yes" }],
          witness: { native: script },
        }),
      }),
    ],
    [
      "a proposal's guardrail",
      (script, hash) => ({
        part: proposal.treasuryWithdrawals({
          rewardAccount: scriptHashToRewardAddress(hash, 0),
          anchor,
          withdrawals: { [scriptHashToRewardAddress(hash, 0)]: 1n },
          guardrail: { native: script },
        }),
      }),
    ],
  ];
/** The parts that take a native script as an object only, and where it is written */
const OBJECT_PARTS: [string, (script: NativeScript) => Made][] = [
  ["auxiliaryScript", (script) => ({ part: auxiliaryScript({ script }) })],
  [
    "an output's reference script",
    (script) => ({
      part: output({
        address: payerAddress,
        value: { lovelace: 5_000_000n },
        scriptRef: script,
      }),
    }),
  ],
];

const builder = new TxBuilder({
  network: "preprod",
  params: DEFAULT_PROTOCOL_PARAMETERS,
  deposits: { govActionDeposit: 1_000_000n },
});

/** Every slot of a time lock in a value: of a script's structure, of a list of them */
const slotsIn = (value: unknown): string[] => {
  if (typeof value !== "object" || value === null) return [];
  const { type, value: inner } = value as { type?: unknown; value?: unknown };
  if (type === "TIMELOCK_START" || type === "TIMELOCK_EXPIRY")
    return [(inner as { slot: string }).slot];
  return Object.values(value).flatMap(slotsIn);
};

/** The native scripts a transaction writes, wherever it writes them, each as written */
const writtenScripts = (tx: string) => {
  const read = Transaction.fromCbor(TxCBOR(tx));
  return [
    ...(read.witnessSet().nativeScripts()?.values() ?? []),
    ...(read.auxiliaryData()?.nativeScripts() ?? []),
    ...read
      .body()
      .outputs()
      .flatMap((o) => {
        const native = o.scriptRef()?.asNative();
        return native ? [native] : [];
      }),
  ].map((script) => script.toCbor().toString());
};

beforeAll(async () => {
  await Crypto.ready();
  expect(
    Crypto.Ed25519PrivateKey.fromNormalHex(KEY).toPublic().hash().hex(),
  ).toBe(keyHash);
});

describe("The slot of a native script's time lock", () => {
  it.each(["after", "before"] as const)(
    "is taken from 0 to 2^64 - 1 exactly by every part, in %s, as CBOR kept as given; its keys and its time lock are read exactly",
    async (kind) => {
      for (const slot of SLOTS)
        for (const form of formsOf(kind, slot)) {
          const hash = nativeHash(form.cbor);
          const parts =
            typeof form.script === "string"
              ? PARTS
              : [...PARTS, ...OBJECT_PARTS];
          for (const [what, make] of parts) {
            const at = [kind, slot.toString(), form.name, what];
            const { part, spent } = (
              make as (script: string | NativeScript, hash: string) => Made
            )(form.script, hash);
            const exact = slot.toString();
            // The part holds the slot exactly; an output, the reference script's bytes
            const reference = what === "an output's reference script";
            if (reference)
              expect([at, (part as OutputPart).output.script_ref]).toEqual([
                at,
                `8200${form.cbor}`,
              ]);
            else expect([at, slotsIn(part)]).toEqual([at, [exact]]);
            const built = await builder.build([part as never], {
              payer: { changeAddress: payerAddress, utxos: [funds] },
            });
            // Written in the bytes given, or in its shortest form; hashed over them
            expect([at, writtenScripts(built.tx)]).toEqual([at, [form.cbor]]);
            if (what === "mint.native")
              expect([
                at,
                [
                  ...(Transaction.fromCbor(TxCBOR(built.tx))
                    .body()
                    .mint()
                    ?.keys() ?? []),
                ],
              ]).toEqual([at, [`${hash}41`]]);
            const utxos = [funds, ...(spent ? [spent] : [])];
            const read = await builder.fromCbor(built.tx, {
              knownUtxos: utxos,
            });
            const listed = requiredSigners(built.tx, utxos);
            const runs = !OBJECT_PARTS.some(([name]) => name === what);
            for (const [whose, scripts] of [
              ["build", built.signers.nativeScripts],
              ["fromCbor", read.signers.nativeScripts],
              ["requiredSigners", listed.nativeScripts],
            ] as const)
              expect([at, whose, slotsIn(scripts)]).toEqual([
                at,
                whose,
                runs ? [exact] : [],
              ]);
            // The prototype read from the bytes holds it exactly too, but in a reference
            // script, which is kept as its bytes
            expect([at, slotsIn(read.prototype)]).toEqual([
              at,
              reference ? [] : [exact],
            ]);
            // The key it names is asked for
            if (form.key && runs) {
              const asked: TxHashRequest[] = [];
              const signer = keySigner(KEY);
              await built.sign({
                signers: (request: TxHashRequest) => {
                  asked.push(request);
                  return signer.signTxHash(request);
                },
              });
              expect([at, asked.flatMap((r) => r.keys)]).toEqual([
                at,
                expect.arrayContaining([{ keyHash, roles: ["nativeScript"] }]),
              ]);
            }
          }
        }
    },
    120_000,
  );

  it.each(["after", "before"] as const)(
    "is refused negative, or past 2^64 - 1, as INVALID_SCRIPT at the part call by every part, in %s, quoting none of it",
    (kind) => {
      const cases: [string | NativeScript, string][] = [
        [`82${kind === "after" ? "04" : "05"}20`, "negative"],
        [
          `820182${sig}82${kind === "after" ? "04" : "05"}3bffffffffffffffff`,
          "negative",
        ],
        [{ type: kind, slot: "-1" }, "negative"],
        [{ type: kind, slot: (2n ** 64n).toString() }, "past 2^64 - 1"],
        [
          {
            type: "any",
            scripts: [{ type: kind, slot: (2n ** 70n).toString() }],
          },
          "past 2^64 - 1",
        ],
      ];
      for (const [script, why] of cases) {
        const parts =
          typeof script === "string" ? PARTS : [...PARTS, ...OBJECT_PARTS];
        for (const [what, make] of parts) {
          const at = [kind, JSON.stringify(script), what];
          let error: unknown;
          try {
            (make as (script: string | NativeScript, hash: string) => Made)(
              script,
              "cd".repeat(28),
            );
          } catch (e) {
            error = e;
          }
          expect([at, TxError.is(error, "INVALID_SCRIPT")]).toEqual([at, true]);
          const message = (error as Error).message;
          expect([at, message]).toEqual([
            at,
            expect.stringContaining(`the slot of a time lock is ${why}`),
          ]);
          for (const quoted of ["18446744073709551616", "-1", "3bffffffff"])
            expect([at, message.includes(quoted)]).toEqual([at, false]);
        }
      }
    },
  );

  it("is refused when it is not a whole number, given in an object", () => {
    for (const slot of ["", "1.5", "5abc", " 5", "0x10", 1.5, null])
      expect(() =>
        mint.native({
          script: { type: "after", slot } as never,
          assets: { "41": 1n },
        }),
      ).toThrow(
        "invalid native script: the slot of a time lock is not a whole number",
      );
    // Decimal digits, a safe integer and a bigint are taken, the slot in its digits
    for (const slot of ["0042", 42, 42n])
      expect(
        slotsIn(
          mint.native({
            script: { type: "after", slot } as never,
            assets: { "41": 1n },
          }),
        ),
      ).toEqual(["42"]);
  });
});

describe("The n of an atLeast script", () => {
  it("is taken as an integer of 64 bits, exactly, and refused outside them", () => {
    const of = (n: bigint) => `8303${int(n)}81${sig}`;
    for (const n of [2n ** 63n - 1n, -(2n ** 63n), 2n ** 53n + 1n]) {
      const part = mint.native({ script: of(n), assets: { "41": 1n } });
      expect(part.witness.script).toMatchObject({
        type: "attached",
        script: { type: "SCRIPT_N_OF_K", value: { n } },
      });
    }
    for (const n of [2n ** 63n, 2n ** 64n - 1n, -(2n ** 63n) - 1n])
      expect(() =>
        mint.native({ script: of(n), assets: { "41": 1n } }),
      ).toThrow(
        "invalid native script: the n of an atLeast script is not an integer of 64 bits",
      );
  });
});

describe("A native script of a kind the ledger does not read in this era", () => {
  it("is refused as INVALID_SCRIPT at the part call, alone and nested, never a raw error", () => {
    // A guard, `[6, credential]`, which the decoder reads
    const guard = `8206${sig}`;
    for (const script of [guard, `820181${guard}`])
      for (const [what, make] of PARTS) {
        let error: unknown;
        try {
          make(script, nativeHash(script));
        } catch (e) {
          error = e;
        }
        expect([what, script, TxError.is(error, "INVALID_SCRIPT")]).toEqual([
          what,
          script,
          true,
        ]);
        expect((error as Error).message).toContain(
          "invalid native script: it holds a kind of native script the ledger does not read in this era",
        );
      }
  });
});
