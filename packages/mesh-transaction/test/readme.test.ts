import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jest } from "@jest/globals";

import { CardanoSDKSerializer } from "@meshsdk/core-cst";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import type { BuiltTx, TxPlan } from "../src";
import {
  assembleTxPrototype,
  message,
  minFee,
  output,
  spend,
  toUtxo,
  TxBuilder,
} from "../src";
import {
  TX_BUILD_ERROR_CODES,
  TX_PLAN_ERROR_CODES,
} from "../src/tx-builder/errors";
import { TX_PART_ERROR_CODES } from "../src/tx-builder/parts/errors";
import { baseAddress } from "./test-util";

// The README is the only copy of its first example: these tests read it, check its shape, run
// its task lines as they stand there, and hold its table of errors to the codes of the package.
// The example of assembling without balancing runs as it stands there too.

const readme = readFileSync(join(__dirname, "..", "README.md"), "utf8");

/** The lines of the README's first `ts` block, or of the first after `heading` */
const firstBlock = (heading?: string): string[] => {
  const at = heading === undefined ? 0 : readme.indexOf(`\n${heading}\n`);
  if (at < 0) throw new Error(`README.md has no ${heading}`);
  const match = /^```ts\n([\s\S]*?)^```$/m.exec(readme.slice(at));
  if (!match) throw new Error("README.md has no ts block");
  return match[1]!.replace(/\n$/, "").split("\n");
};

/** The index of the first line of the block that starts with `start`, or -1 */
const lineStarting = (lines: string[], start: string) =>
  lines.findIndex((line) => line.startsWith(start));

/** The task lines of the first block: from the builder through the log of the hash */
const taskLines = (): string => {
  const lines = firstBlock();
  const from = lineStarting(lines, "const builder = new TxBuilder(");
  const to = lineStarting(lines, 'console.log(plan.step("main").txHash);');
  if (from < 0 || to < from)
    throw new Error("the first ts block of README.md has no task lines");
  return lines.slice(from, to + 1).join("\n");
};

/** The constructor of async functions, to run the task lines with the names they use */
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...values: unknown[]) => Promise<unknown>;

describe("README.md", () => {
  it("starts with a payment set up on a real provider and wallet, then the task", () => {
    const lines = firstBlock();
    const provider = lineStarting(lines, "const provider = ");
    const wallet = lineStarting(lines, "const wallet = ");
    const builder = lineStarting(lines, "const builder = new TxBuilder(");
    const log = lineStarting(lines, 'console.log(plan.step("main").txHash);');
    expect(provider).toBeGreaterThanOrEqual(0);
    expect(wallet).toBeGreaterThanOrEqual(0);
    expect(builder).toBeGreaterThan(Math.max(provider, wallet));
    expect(log).toBeGreaterThan(builder);
  });

  it("pays with the task lines of its first example, run on TxEmulator", async () => {
    const emulator = await TxEmulator.create({
      validator: "scalus",
      network: "preprod",
    });
    const wallet = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words: Array(24).fill("solution") },
    });
    emulator.fund(await wallet.getChangeAddress(), {
      lovelace: 100_000_000n,
    });
    const recipient = baseAddress(2);

    const run = new AsyncFunction(
      "TxBuilder",
      "output",
      "provider",
      "wallet",
      "recipient",
      `${taskLines()}\nreturn plan;`,
    );
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    let plan: TxPlan;
    try {
      plan = (await run(
        TxBuilder,
        output,
        emulator,
        wallet,
        recipient,
      )) as typeof plan;
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(plan.step("main").txHash);
    } finally {
      log.mockRestore();
    }

    const { txHash, status } = plan.step("main");
    expect(status).toBe("included");
    expect(plan.status).toBe("pending");
    expect((await emulator.fetchTxInfo(txHash)).hash).toBe(txHash);
    const received = await emulator.fetchAddressUTxOs(recipient);
    expect(
      received.some(
        (utxo) =>
          utxo.input.txHash === txHash &&
          utxo.output.amount.length === 1 &&
          utxo.output.amount[0]!.unit === "lovelace" &&
          utxo.output.amount[0]!.quantity === "2000000",
      ),
    ).toBe(true);
  }, 60_000);

  it("pays with its example of assembling without balancing, signed and accepted on TxEmulator", async () => {
    const lines = firstBlock("### Assembling without balancing");
    // What the example imports is what it is run with
    const names = {
      CardanoSDKSerializer,
      assembleTxPrototype,
      message,
      minFee,
      output,
      spend,
      toUtxo,
    };
    const imported = lines
      .join("\n")
      .match(/^import \{[^}]*\}/gm)!
      .flatMap((line) => line.replace(/^import \{|\}$/g, "").split(","))
      .map((name) => name.trim())
      .filter((name) => name !== "");
    expect(imported.sort()).toEqual(Object.keys(names).sort());
    const from = lineStarting(lines, "const fee = ");
    const to = lineStarting(lines, "await final.submit();");
    expect(from).toBeGreaterThan(0);
    expect(to).toBe(lines.length - 1);

    const emulator = await TxEmulator.create({
      validator: "scalus",
      network: "preprod",
    });
    const wallet = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words: Array(24).fill("solution") },
    });
    const changeAddress = await wallet.getChangeAddress();
    const funded = emulator.fund(changeAddress, { lovelace: 100_000_000n });
    const recipient = baseAddress(2);
    const run = new AsyncFunction(
      ...Object.keys(names),
      "builder",
      "utxoFromProvider",
      "recipient",
      "changeAddress",
      "params",
      "wallet",
      `${lines.slice(from).join("\n")}\nreturn final;`,
    );
    const final = (await run(
      ...Object.values(names),
      new TxBuilder({ network: "preprod", provider: emulator }),
      funded,
      recipient,
      changeAddress,
      await emulator.fetchProtocolParameters(),
      wallet,
    )) as BuiltTx;

    expect(final.fee).toBe(200_000n);
    expect(final.missing).toEqual([]);
    expect((await emulator.fetchTxInfo(final.txHash)).hash).toBe(final.txHash);
    const received = await emulator.fetchAddressUTxOs(recipient);
    expect(
      received.some(
        (utxo) =>
          utxo.input.txHash === final.txHash &&
          utxo.output.amount.length === 1 &&
          utxo.output.amount[0]!.quantity === "5000000",
      ),
    ).toBe(true);
  }, 60_000);

  it("names every error code in its table of errors", () => {
    const section = /^## Errors\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(readme);
    expect(section).not.toBeNull();
    const table = section![1]!
      .split("\n")
      .filter((line) => line.startsWith("|"))
      .join("\n");
    const missing = [
      ...TX_PART_ERROR_CODES,
      ...TX_BUILD_ERROR_CODES,
      ...TX_PLAN_ERROR_CODES,
    ].filter((code) => !table.includes(`\`${code}\``));
    expect(missing).toEqual([]);
  });
});
