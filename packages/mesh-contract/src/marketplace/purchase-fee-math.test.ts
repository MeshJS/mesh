import { describe, expect, it } from "@jest/globals";
import { computeMarketplacePurchasePayouts } from "./purchase-fee-math";

describe("computeMarketplacePurchasePayouts", () => {
  it("does not throw TypeError when datum price int is BigInt", () => {
    expect(() =>
      computeMarketplacePurchasePayouts(100_000_000n, 250, "2000000"),
    ).not.toThrow();
  });

  it("computes owner fee (2.5%) and seller payout with BigInt price", () => {
    // 100 ADA price, 2.5% fee => 2.5 ADA (above 1 ADA minimum)
    const { ownerToReceiveLovelace, sellerToReceiveLovelace } =
      computeMarketplacePurchasePayouts(100_000_000n, 250, "2000000");
    expect(ownerToReceiveLovelace).toBe(2_500_000n);
    expect(sellerToReceiveLovelace).toBe(102_000_000n);
  });

  it("enforces minimum 1 ADA owner fee when basis points > 0", () => {
    const { ownerToReceiveLovelace } = computeMarketplacePurchasePayouts(
      1_000n,
      250,
      "0",
    );
    expect(ownerToReceiveLovelace).toBe(1_000_000n);
  });

  it("still works when price int is a Number", () => {
    const { ownerToReceiveLovelace, sellerToReceiveLovelace } =
      computeMarketplacePurchasePayouts(100_000_000, 250, "2000000");
    expect(ownerToReceiveLovelace).toBe(2_500_000n);
    expect(sellerToReceiveLovelace).toBe(102_000_000n);
  });
});
