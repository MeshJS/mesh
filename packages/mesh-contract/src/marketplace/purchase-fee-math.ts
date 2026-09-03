/**
 * BigInt-safe fee / payout math for MeshMarketplaceContract.purchaseAsset.
 * On-chain datum ints may deserialize as bigint; mixing with Number throws
 * TypeError: Cannot mix BigInt and other types.
 */
export function computeMarketplacePurchasePayouts(
  priceInt: number | bigint,
  feePercentageBasisPoint: number,
  inputLovelace: string | number | bigint,
): {
  ownerToReceiveLovelace: bigint;
  sellerToReceiveLovelace: bigint;
} {
  const price = BigInt(priceInt);
  const feeBp = BigInt(feePercentageBasisPoint);
  // Match prior Math.ceil(float) semantics for positive amounts.
  let ownerToReceiveLovelace =
    feeBp === 0n ? 0n : (price * feeBp + 9999n) / 10000n;
  if (feePercentageBasisPoint > 0 && ownerToReceiveLovelace < 1000000n) {
    ownerToReceiveLovelace = 1000000n;
  }
  const sellerToReceiveLovelace = price + BigInt(inputLovelace);
  return { ownerToReceiveLovelace, sellerToReceiveLovelace };
}
