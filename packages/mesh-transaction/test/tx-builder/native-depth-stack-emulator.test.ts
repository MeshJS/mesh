import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

import { itemDepth, MAX_NATIVE_DEPTH } from "../../src/tx-builder/tx-scan";

/*
 * The keys of a native reference script are read to the depth a small stack holds: on
 * `node --stack-size=400`, about a browser's, every path that reads them runs through for a script
 * at `MAX_NATIVE_DEPTH` (512 levels as the walk counts them), and one a level deeper is treated
 * as a script whose keys are not read. The paths run in a child process on that stack, the source
 * bundled for it.
 */

const SRC = resolve(__dirname, "../../src/tx-builder/index.ts");
const PACKAGE = resolve(__dirname, "../..");

/** The child: each path for a script nested `levels` times, `all` around `inner` */
const CHILD = `
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import { Address, Crypto, HexBlob, transactionPrototypeFromHex } from "@meshsdk/core-cst";
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
    finalize: await outcome(async () =>
      roundTrip(await offline().finalize(transactionPrototypeFromHex(tx), { inputs: known })),
    ),
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

  it("reads them on node --stack-size=400 for a script of 512 levels, `all` around a key 255 times, in every path: a build through { reference }, fromCbor, requiredSigners, finalize, a plan of the step given built, each written to JSON and read back", () => {
    const shape = `8200${"820181".repeat(255)}8200581c${"ab".repeat(28)}`;
    expect(itemDepth(Buffer.from(shape, "hex"))).toBe(MAX_NATIVE_DEPTH);
    expect(onSmallStack(255, "key")).toEqual({
      described: "native",
      build: "1/1",
      fromCbor: "1/1",
      requiredSigners: "1",
      finalize: "1/1",
      plan: "1/1",
    });
  }, 180_000);

  it("treats one of 513 levels, around all [] 255 times, as one whose keys are not read: the build refuses it, the reads list it not", () => {
    const shape = `8200${"820181".repeat(255)}820180`;
    expect(itemDepth(Buffer.from(shape, "hex"))).toBe(MAX_NATIVE_DEPTH + 1);
    expect(onSmallStack(255, "empty")).toEqual({
      described: "native",
      build: "threw INVALID_SCRIPT",
      fromCbor: "0/0",
      requiredSigners: "0",
      finalize: "0/0",
      plan: "0/0",
    });
  }, 180_000);
});
