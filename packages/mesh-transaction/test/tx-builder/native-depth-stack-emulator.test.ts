import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import { Address, HexBlob } from "@meshsdk/core-cst";

import type { TxBuildError } from "../../src/tx-builder";
import { requiredSigners, TxBuilder } from "../../src/tx-builder";
import {
  itemDepth,
  MAX_NATIVE_DEPTH,
  MAX_TX_BYTES,
} from "../../src/tx-builder/tx-scan";
import * as cbor from "./cbor-util";

/*
 * The keys of a native reference script are read to the depth a small stack holds: on
 * `node --stack-size=400`, about a browser's, every path that reads them runs through for a script
 * at `MAX_NATIVE_DEPTH` (512 levels as the walk counts them), and one a level deeper is treated
 * as a script whose keys are not read: the build refuses it, and so does a read of a transaction
 * that runs it. The paths run in a child process on that stack, the source
 * bundled for it.
 */

const SRC = resolve(__dirname, "../../src/tx-builder/index.ts");
const PACKAGE = resolve(__dirname, "../..");

/** The child: each path for a script nested `levels` times, `all` around `inner` */
const CHILD = `
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import { Address, Crypto, HexBlob } from "@meshsdk/core-cst";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";
import * as mt from ${JSON.stringify(SRC)};

const params = { ...DEFAULT_PROTOCOL_PARAMETERS };
const txOf = (i: number) => "ee" + (i + 1).toString(16).padStart(62, "0");
const head = (major: number, n: number) => {
  const m = major << 5;
  if (n < 24) return (m | n).toString(16).padStart(2, "0");
  if (n < 0x100) return (m | 24).toString(16) + n.toString(16).padStart(2, "0");
  return (m | 25).toString(16) + n.toString(16).padStart(4, "0");
};
const bytes = (t: string) => head(2, t.length / 2) + t;
const list = (items: string[]) => head(4, items.length) + items.join("");
const outcome = async (f: () => Promise<unknown> | unknown) => {
  try {
    return String(await f());
  } catch (e) {
    return "threw " + ((e as { code?: string }).code ?? (e as Error).constructor.name);
  }
};

(async () => {
  const [levels, around] = process.argv.slice(2);
  const emulator = await TxEmulator.create({ validator: "scalus", network: "preprod", slot: 100_000_000 });
  const wallet = new MeshWallet({ networkId: 0, key: { type: "mnemonic", words: Array(24).fill("solution") } });
  await wallet.init();
  const address = (await wallet.getChangeAddress())!;
  const addressHex = Address.fromBech32(address).toBytes().toString();
  const keyHash = Address.fromBech32(address).asBase()!.getPaymentCredential().hash.toString();
  const inner = around === "key" ? "8200581c" + keyHash : "820180";
  const item = "820181".repeat(Number(levels)) + inner;
  const ref = "8200" + item;
  const policy = Crypto.blake2b.hash(HexBlob("00" + item), 28).toString();
  const funded = emulator.fund(address, { lovelace: 100_000_000n });
  const holder = {
    input: { txHash: txOf(1), outputIndex: 0 },
    output: { address, amount: [{ unit: "lovelace", quantity: "5000000" }], scriptRef: ref },
  };
  const body = [
    "00" + list(["825820" + funded.input.txHash + head(0, funded.input.outputIndex)]),
    "01" + list(["a200" + bytes(addressHex) + "011a05e69ec0"]),
    "021a000f4240",
    "09a1581c" + policy + "a14001",
    "12" + list(["825820" + holder.input.txHash + "00"]),
  ];
  const tx = "84" + head(5, body.length) + body.join("") + "a0f5f6";
  const known = [
    { input: funded.input, output: { address, amount: [{ unit: "lovelace", quantity: "100000000" }] } },
    holder,
  ];
  const offline = () => new mt.TxBuilder({ network: "preprod", params });
  const roundTrip = async (built: mt.BuiltTx) => {
    const again = await offline().restore(JSON.parse(JSON.stringify(built.toJSON())));
    return built.signers.nativeScripts.length + "/" + again.signers.nativeScripts.length;
  };
  const results = {
    described: mt.toUtxo(holder).script?.type,
    build: await outcome(async () =>
      roundTrip(
        await offline().build(
          [mt.mint.native({ assets: { "": 1n }, script: { reference: holder } })],
          { payer: { changeAddress: address, utxos: known.slice(0, 1) } },
        ),
      ),
    ),
    fromCbor: await outcome(async () => roundTrip(await offline().fromCbor(tx, { knownUtxos: known }))),
    requiredSigners: await outcome(() => mt.requiredSigners(tx, known).nativeScripts.length),
    plan: await outcome(async () => {
      const builder = new mt.TxBuilder({ network: "preprod", provider: emulator, evaluator: emulator });
      const plan = await builder.plan({ given: tx }, { payer: wallet, knownUtxos: [holder] });
      const again = await builder.resume(JSON.parse(JSON.stringify(plan)));
      return plan.step("given").signers.nativeScripts.length + "/" + again.step("given").signers.nativeScripts.length;
    }),
  };
  process.stdout.write(JSON.stringify(results));
})();
`;

describe("the keys of a native reference script, read to the depth a small stack holds", () => {
  let dir: string;
  let bundle: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "native-depth-"));
    const entry = join(dir, "child.ts");
    writeFileSync(entry, CHILD);
    bundle = join(dir, "child.cjs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const esbuild = require("esbuild") as typeof import("esbuild");
    esbuild.buildSync({
      entryPoints: [entry],
      bundle: true,
      platform: "node",
      format: "cjs",
      packages: "external",
      outfile: bundle,
      logLevel: "error",
    });
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  /** The paths for a script nested `levels` times, on a stack of 400 KB, in a child process */
  const onSmallStack = (levels: number, around: "key" | "empty") =>
    JSON.parse(
      execFileSync(
        process.execPath,
        ["--stack-size=400", bundle, String(levels), around],
        {
          env: {
            ...process.env,
            NODE_PATH: [
              join(PACKAGE, "node_modules"),
              resolve(PACKAGE, "../../node_modules"),
            ].join(":"),
          },
          encoding: "utf8",
          timeout: 120_000,
        },
      ),
    ) as Record<string, string>;

  it("reads them on node --stack-size=400 for a script of 512 levels, `all` around a key 255 times, in every path: a build through { reference }, fromCbor, requiredSigners, a plan of the step given built, each written to JSON and read back", () => {
    const shape = `8200${"820181".repeat(255)}8200581c${"ab".repeat(28)}`;
    expect(itemDepth(Buffer.from(shape, "hex"))).toBe(MAX_NATIVE_DEPTH);
    expect(onSmallStack(255, "key")).toEqual({
      described: "native",
      build: "1/1",
      fromCbor: "1/1",
      requiredSigners: "1",
      plan: "1/1",
    });
  }, 180_000);

  it("treats one of 513 levels, around all [] 255 times, as one whose keys are not read: the build refuses it, and so do the reads of a transaction that runs it", () => {
    const shape = `8200${"820181".repeat(255)}820180`;
    expect(itemDepth(Buffer.from(shape, "hex"))).toBe(MAX_NATIVE_DEPTH + 1);
    expect(onSmallStack(255, "empty")).toEqual({
      described: "native",
      build: "threw INVALID_SCRIPT",
      fromCbor: "threw NATIVE_SCRIPT_UNREAD",
      requiredSigners: "threw NATIVE_SCRIPT_UNREAD",
      plan: "threw NATIVE_SCRIPT_UNREAD",
    });
  }, 180_000);
});

/** The child: requiredSigners and fromCbor of a transaction whose witness set holds a script */
const WITNESS_CHILD = `
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import { Address, Crypto, HexBlob } from "@meshsdk/core-cst";
import * as mt from ${JSON.stringify(SRC)};
import { countedKeys } from ${JSON.stringify(resolve(__dirname, "../../src/tx-builder/witnesses.ts"))};

const KEY = "5a".repeat(28);
const head = (major: number, n: number) => {
  const m = major << 5;
  if (n < 24) return (m | n).toString(16).padStart(2, "0");
  if (n < 0x100) return (m | 24).toString(16) + n.toString(16).padStart(2, "0");
  return (m | 25).toString(16) + n.toString(16).padStart(4, "0");
};
const bytes = (t: string) => head(2, t.length / 2) + t;
const outcome = async (f: () => Promise<mt.TxSigners> | mt.TxSigners) => {
  try {
    const signers = await f();
    return { listed: signers.nativeScripts.length, key: countedKeys(signers).includes(KEY) };
  } catch (e) {
    const { code, message, details } = e as mt.TxError;
    return { threw: code ?? (e as Error).constructor.name, message, details };
  }
};

(async () => {
  const levels = Number(process.argv[2]);
  // An entry the output holds beside its address and its coin, if any
  const entry = process.argv[3] ?? "";
  const address = Address.fromBytes(HexBlob("60" + "ab".repeat(28))).toBech32();
  const item = "820181".repeat(levels) + "8200581c" + KEY;
  const policy = Crypto.blake2b.hash(HexBlob("00" + item), 28).toString();
  const spent = {
    input: { txHash: "ee" + "00".repeat(30) + "09", outputIndex: 0 },
    output: { address, amount: [{ unit: "lovelace", quantity: "50000000" }] },
  };
  const body = [
    "0081825820" + spent.input.txHash + "00",
    "0181" + (entry === "" ? "a2" : "a3") + "00" + bytes("60" + "ab".repeat(28)) + "011a002dc6c0" + entry,
    "021a000f4240",
    "09a1581c" + policy + "a14001",
  ];
  const tx = "84" + head(5, body.length) + body.join("") + "a10181" + item + "f5f6";
  const params = { ...DEFAULT_PROTOCOL_PARAMETERS };
  const results = {
    requiredSigners: await outcome(() => mt.requiredSigners(tx, [spent])),
    fromCbor: await outcome(async () =>
      (await new mt.TxBuilder({ network: "preprod", params }).fromCbor(tx, { knownUtxos: [spent] })).signers,
    ),
  };
  process.stdout.write(JSON.stringify(results));
})();
`;

describe("a native script of the witness set, read by requiredSigners to the depth fromCbor reads", () => {
  let dir: string;
  let bundle: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "witness-depth-"));
    const entry = join(dir, "child.ts");
    writeFileSync(entry, WITNESS_CHILD);
    bundle = join(dir, "child.cjs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const esbuild = require("esbuild") as typeof import("esbuild");
    esbuild.buildSync({
      entryPoints: [entry],
      bundle: true,
      platform: "node",
      format: "cjs",
      packages: "external",
      outfile: bundle,
      logLevel: "error",
    });
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  /**
   * requiredSigners and fromCbor for `all` around a key `levels` times, in a fresh process; the
   * output holds `entry` too, if given
   */
  const inChild = (levels: number, stack: "default" | "small", entry = "") =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          ...(stack === "small" ? ["--stack-size=400"] : []),
          bundle,
          String(levels),
          entry,
        ],
        {
          env: {
            ...process.env,
            NODE_PATH: [
              join(PACKAGE, "node_modules"),
              resolve(PACKAGE, "../../node_modules"),
            ].join(":"),
          },
          encoding: "utf8",
          timeout: 120_000,
        },
      ),
    ) as Record<string, Record<string, unknown>>;

  /** The refusal of fromCbor, in these words */
  const refusal = (message: string) => ({
    threw: "INVALID_OPTION",
    message,
    details: {
      option: "tx",
      value: "string",
      allowed: "a transaction in CBOR hex",
    },
  });

  it.each([
    [1_100, "default"],
    [1_100, "small"],
    [2_950, "default"],
    [2_950, "small"],
  ] as const)(
    "refuses one of `all` around a key %d times, on the %s stack, as fromCbor refuses the transaction: the same code, details and words, never the runtime's error",
    (levels, stack) => {
      const { requiredSigners, fromCbor } = inChild(levels, stack);
      expect(fromCbor).toEqual(
        refusal(
          "invalid tx: the transaction nests its items deeper than the 1024 levels this library reads",
        ),
      );
      expect(requiredSigners).toEqual(fromCbor);
    },
    180_000,
  );

  // An entry of an output whose item under tag 24 is followed by bytes the value decoder passes
  // over: not well-formed where the walk reads them, before the witness set
  const FOLLOWED: [string, string][] = [
    [
      "an inline datum 0 followed by a break",
      `028201d818${cbor.bytes("00ff")}`,
    ],
    [
      "an inline datum 0 followed by a simple value in two bytes",
      `028201d818${cbor.bytes("00f800")}`,
    ],
    [
      "an inline datum 0 followed by a reserved head",
      `028201d818${cbor.bytes("001c")}`,
    ],
    [
      "a reference script [2, h'00'] followed by a break",
      `03d818${cbor.bytes("82024100ff")}`,
    ],
  ];

  it.each(
    FOLLOWED.flatMap(([name, entry]) =>
      (
        [
          [2_600, "default"],
          [2_950, "default"],
          [1_100, "small"],
        ] as const
      ).map(([levels, stack]) => [levels, stack, name, entry] as const),
    ),
  )(
    "refuses one of `all` around a key %d times, on the %s stack, beside %s, as fromCbor refuses the transaction: not well-formed, never the runtime's error",
    (levels, stack, _, entry) => {
      const { requiredSigners, fromCbor } = inChild(levels, stack, entry);
      expect(fromCbor).toEqual(
        refusal(
          "invalid tx: expected a transaction in CBOR hex: it is not well-formed CBOR",
        ),
      );
      expect(requiredSigners).toEqual(fromCbor);
    },
    180_000,
  );

  it.each(["default", "small"] as const)(
    "lists the keys of one of `all` around a key 303 times, the deepest fromCbor reads, on the %s stack; one of 304 is refused by both, as fromCbor refuses it",
    (stack) => {
      expect(inChild(303, stack)).toEqual({
        requiredSigners: { listed: 1, key: true },
        fromCbor: { listed: 1, key: true },
      });
      // A level deeper, the work its decoder would have
      const deeper = inChild(304, stack);
      expect(deeper.fromCbor).toEqual(
        refusal(
          "invalid tx: the transaction carries more nested data than this library reads",
        ),
      );
      expect(deeper.requiredSigners).toEqual(deeper.fromCbor);
    },
    180_000,
  );
});

describe("requiredSigners refuses a transaction larger than fromCbor reads, before it is read", () => {
  const spent = {
    input: { txHash: `ee${"00".repeat(30)}09`, outputIndex: 0 },
    output: {
      address: Address.fromBytes(HexBlob(`60${"ab".repeat(28)}`)).toBech32(),
      amount: [{ unit: "lovelace", quantity: "50000000" }],
    },
  };
  /**
   * A transaction whose output holds an inline datum 0 followed, in its byte string, by tag 24
   * nested 1 000 times around `pad` zeros: well formed, and as deep as a transaction is read
   */
  const nested = (pad: number) => {
    let inner = "00".repeat(pad);
    for (let i = 0; i < 1_000; i++) inner = `d818${cbor.bytes(inner)}`;
    const output = cbor.map(
      [cbor.uint(0), cbor.bytes(`60${"ab".repeat(28)}`)],
      [cbor.uint(1), cbor.uint(3_000_000)],
      [cbor.uint(2), cbor.arr(cbor.uint(1), `d818${cbor.bytes(`00${inner}`)}`)],
    );
    return cbor.arr(
      cbor.map(
        [
          cbor.uint(0),
          cbor.arr(cbor.arr(cbor.bytes(spent.input.txHash), cbor.uint(0))),
        ],
        [cbor.uint(1), cbor.arr(output)],
        [cbor.uint(2), cbor.uint(1_000_000)],
      ),
      cbor.map(),
      "f5",
      "f6",
    );
  };

  it.each([
    [60_000, 65_000],
    [250_000, 257_000],
  ])(
    "refuses one of tag 24 nested around %d zeros, about %d bytes, for its size, as fromCbor refuses it",
    async (pad, about) => {
      const tx = nested(pad);
      expect(Math.abs(tx.length / 2 - about)).toBeLessThan(1_000);
      const refused = async (read: () => unknown) => {
        try {
          await read();
        } catch (error) {
          const { code, message, details } =
            error as TxBuildError<"INVALID_OPTION">;
          return { code, message, details };
        }
        return "read";
      };
      const fromCbor = await refused(() =>
        new TxBuilder({
          network: "preprod",
          params: { ...DEFAULT_PROTOCOL_PARAMETERS },
        }).fromCbor(tx, { knownUtxos: [spent] }),
      );
      expect(fromCbor).toEqual({
        code: "INVALID_OPTION",
        message: `invalid tx: the transaction is more than the ${MAX_TX_BYTES} bytes of the protocol's maximum transaction size`,
        details: {
          option: "tx",
          value: "string",
          allowed: "a transaction in CBOR hex",
        },
      });
      expect(await refused(() => requiredSigners(tx, [spent]))).toEqual(
        fromCbor,
      );
    },
  );
});
