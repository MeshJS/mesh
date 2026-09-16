import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
for (const format of ["esm", "cjs"]) {
  test(`the ${format} provider package initializes and queries Scalus`, async () => {
    const pkg =
      format === "esm"
        ? await import("../dist/index.js")
        : require("../dist/index.cjs");
    const provider = await pkg.ScalusEmulator.create();
    assert.ok((await provider.fetchProtocolParameters()).minFeeA > 0);
    assert.equal((await provider.fetchCostModels()).length, 3);
    assert.deepEqual(await provider.fetchUTxOs("00".repeat(32)), []);
    await assert.rejects(provider.submitTx("80"));
  });
}
