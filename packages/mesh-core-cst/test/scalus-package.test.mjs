import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

import { scriptTxCborHex, scriptUtxoCborHex } from "./fixtures/scalus-v3.mjs";

const require = createRequire(import.meta.url);
for (const format of ["esm", "cjs"]) {
  test(`Scalus evaluator in the ${format} package evaluates a real V3 redeemer`, async () => {
    const pkg =
      format === "esm"
        ? await import("../dist/index.js")
        : require("../dist/index.cjs");
    assert.equal(scriptUtxoCborHex.slice(0, 2), "a1");
    const utxo = pkg.fromTxUnspentOutput(
      pkg.TransactionUnspentOutput.fromCbor("82" + scriptUtxoCborHex.slice(2)),
    );
    const evaluator = new pkg.OfflineEvaluatorScalus(
      { fetchUTxOs: async () => [utxo] },
      "preview",
    );
    const budgets = await evaluator.evaluateTx(scriptTxCborHex, [utxo]);
    assert.deepEqual(budgets, [
      { tag: "REWARD", index: 0, budget: { mem: 32318, steps: 8754898 } },
    ]);
  });
}
