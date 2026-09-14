import {
  multiAssetPrototypeToAssets,
  valuePrototypeToCardano,
} from "../../src/tx-prototype-to-cbor/value";

const POLICY_ID = "aa".repeat(28);
const ASSET_NAME_HEX = "6d795f746f6b656e"; // "my_token"

describe("multiAssetPrototypeToAssets", () => {
  it("returns just lovelace when there is no multiasset", () => {
    expect(multiAssetPrototypeToAssets("1000000", undefined)).toEqual([
      { unit: "lovelace", quantity: "1000000" },
    ]);
  });

  it("flattens policy/assetName/quantity into unit = policyId + assetNameHex", () => {
    const assets = multiAssetPrototypeToAssets("1000000", {
      [POLICY_ID]: { [ASSET_NAME_HEX]: "5" },
    });
    expect(assets).toEqual([
      { unit: "lovelace", quantity: "1000000" },
      { unit: `${POLICY_ID}${ASSET_NAME_HEX}`, quantity: "5" },
    ]);
  });
});

describe("valuePrototypeToCardano", () => {
  it("converts lovelace-only value", () => {
    const value = valuePrototypeToCardano({ coin: "1000000" });
    expect(value.coin()).toEqual(1000000n);
    expect(value.multiasset()).toBeUndefined();
  });

  it("converts a value with a multiasset", () => {
    const value = valuePrototypeToCardano({
      coin: "2000000",
      multiasset: { [POLICY_ID]: { [ASSET_NAME_HEX]: "5" } },
    });
    expect(value.coin()).toEqual(2000000n);
    const multiasset = value.multiasset()!;
    expect(multiasset.size).toEqual(1);
    expect([...multiasset.values()][0]).toEqual(5n);
  });
});
