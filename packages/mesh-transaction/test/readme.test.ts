import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jest } from "@jest/globals";

import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import { output, TxBuilder } from "../src";
import {
  TX_BUILD_ERROR_CODES,
  TX_INTENT_ERROR_CODES,
} from "../src/tx-builder/errors";
import { TX_PART_ERROR_CODES } from "../src/tx-builder/parts/errors";
import { baseAddress } from "./test-util";

// The README is the only copy of its first example: these tests read it, check its shape, run
// its task lines as they stand there, and hold its table of errors to the codes of the package.

const readme = readFileSync(join(__dirname, "..", "README.md"), "utf8");

/** The lines of the README's first `ts` block */
const firstBlock = (): string[] => {
  const match = /^```ts\n([\s\S]*?)^```$/m.exec(readme);
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
  const to = lineStarting(lines, "console.log(intent.txHash);");
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
    const log = lineStarting(lines, "console.log(intent.txHash);");
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
      `${taskLines()}\nreturn intent;`,
    );
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    let intent: { status: string; txHash?: string };
    try {
      intent = (await run(
        TxBuilder,
        output,
        emulator,
        wallet,
        recipient,
      )) as typeof intent;
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(intent.txHash);
    } finally {
      log.mockRestore();
    }

    expect(intent.status).toBe("included");
    expect((await emulator.fetchTxInfo(intent.txHash!)).hash).toBe(
      intent.txHash,
    );
    const received = await emulator.fetchAddressUTxOs(recipient);
    expect(
      received.some(
        (utxo) =>
          utxo.input.txHash === intent.txHash &&
          utxo.output.amount.length === 1 &&
          utxo.output.amount[0]!.unit === "lovelace" &&
          utxo.output.amount[0]!.quantity === "2000000",
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
      ...TX_INTENT_ERROR_CODES,
    ].filter((code) => !table.includes(`\`${code}\``));
    expect(missing).toEqual([]);
  });
});
