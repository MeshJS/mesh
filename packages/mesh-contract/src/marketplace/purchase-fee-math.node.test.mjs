/**
 * Zero-dep regression harness for marketplace purchaseAsset BigInt fee math.
 * Run: node --test packages/mesh-contract/src/marketplace/purchase-fee-math.node.test.mjs
 * Full helper assertions: packages/mesh-contract/src/marketplace/purchase-fee-math.test.ts (jest)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Prior buggy formula from purchaseAsset. */
function buggyLegacyMix(priceInt, feePercentageBasisPoint, inputLovelace) {
  let ownerToReceiveLovelace =
    (priceInt * feePercentageBasisPoint) / 10000;
  if (feePercentageBasisPoint > 0 && ownerToReceiveLovelace < 1000000) {
    ownerToReceiveLovelace = 1000000;
  }
  const sellerToReceiveLovelace = priceInt + Number(inputLovelace);
  return { ownerToReceiveLovelace, sellerToReceiveLovelace };
}

describe("purchaseAsset fee math BigInt regression", () => {
  it("legacy Number-mix throws TypeError when price is BigInt", () => {
    assert.throws(
      () => buggyLegacyMix(100_000_000n, 250, "2000000"),
      (err) =>
        err instanceof TypeError &&
        /Cannot mix BigInt and other types/.test(err.message),
    );
  });

  it("offchain.ts purchaseAsset uses computeMarketplacePurchasePayouts", () => {
    const src = readFileSync(join(__dirname, "offchain.ts"), "utf8");
    assert.match(src, /computeMarketplacePurchasePayouts/);
    assert.doesNotMatch(
      src,
      /\(inputDatum\.fields\[1\]\.int as number\) \* this\.feePercentageBasisPoint/,
    );
    assert.doesNotMatch(
      src,
      /\(inputDatum\.fields\[1\]\.int as number\) \+ Number\(inputLovelace\)/,
    );
  });

  it("purchase-fee-math.ts uses BigInt arithmetic", () => {
    const src = readFileSync(join(__dirname, "purchase-fee-math.ts"), "utf8");
    assert.match(src, /BigInt\(priceInt\)/);
    assert.match(src, /10000n/);
    assert.doesNotMatch(src, /as number\) \* feePercentageBasisPoint/);
  });
});
