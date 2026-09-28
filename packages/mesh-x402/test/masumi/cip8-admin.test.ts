import { cborByteString, cip8SigStructure, computeDisputeWithdrawalDigest } from "../../src/masumi/cip8-admin";

const hex = (h: string) => Buffer.from(h, "hex");
const toHex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe("cip8-admin - byte-exact vectors from vested_pay.ak's own tests", () => {
  it("cborByteString matches the validator's test vectors", () => {
    expect(toHex(cborByteString(hex("010203")))).toBe("43010203");
    expect(toHex(cborByteString(hex("000102030405060708090a0b0c0d0e0f1011121314151617")))).toBe(
      "5818000102030405060708090a0b0c0d0e0f1011121314151617",
    );
  });

  it("cip8SigStructure matches the validator's test vector", () => {
    expect(toHex(cip8SigStructure(hex("a10126"), hex("0001")))).toBe(
      "846a5369676e61747572653143a1012640420001",
    );
  });

  // Regression test for a real bug found via live preprod testing: @harmoniclabs/plutus-data's
  // dataToCbor encodes a non-empty Plutus Data Map using INDEFINITE-length CBOR (`bf...ff`),
  // but Aiken's `cbor.serialise` (what the validator uses to recompute this same digest
  // on-chain) encodes it using DEFINITE-length CBOR (`a1...`). This mismatch silently produced
  // a digest the validator could never reproduce for any non-empty AssetValue, so every real
  // (non-zero) WithdrawDisputed payout failed signature verification on-chain despite the
  // off-chain sign/verify round-trip agreeing with itself. This expected digest was computed
  // independently via the actual `aiken` CLI (v1.1.23, matching the pinned compiler version)
  // against the real deployed validator source, not derived from this implementation.
  it("computeDisputeWithdrawalDigest matches the validator's own cbor.serialise for a non-empty AssetValue", async () => {
    const digest = await computeDisputeWithdrawalDigest(
      { txHash: "71596eba35edab7ee96406eb0ba571ffbf0660274b319f9f96926f48e0ebd089", outputIndex: 0 },
      [{ policyId: "", assets: [{ assetName: "", quantity: 1_500_000n }] }],
      [],
    );
    expect(digest).toBe("e2dfe5ab50d48774b1521eea2e2bdfc95591884c2cdcd7b7e2ec4a72");
  });

  it("computeDisputeWithdrawalDigest still matches for empty buyer/seller AssetValue lists", async () => {
    const digest = await computeDisputeWithdrawalDigest(
      { txHash: "1111111111111111111111111111111111111111111111111111111111111111", outputIndex: 0 },
      [],
      [],
    );
    expect(digest).toMatch(/^[0-9a-f]{56}$/);
  });
});
