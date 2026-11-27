import { mergeAssets } from "../../src/types/asset";

describe("mergeAssets", () => {
  it("merges duplicate quantities without mutating input assets", () => {
    const first = Object.freeze({ unit: "lovelace", quantity: "5000000" });
    const other = Object.freeze({ unit: "asset", quantity: "1" });
    const second = Object.freeze({ unit: "lovelace", quantity: "2000000" });

    const result = mergeAssets([first, other, second]);

    expect(result).toEqual([
      { unit: "lovelace", quantity: "7000000" },
      { unit: "asset", quantity: "1" },
    ]);
    expect(result[0]).not.toBe(first);
    expect(result[1]).not.toBe(other);
  });
});
