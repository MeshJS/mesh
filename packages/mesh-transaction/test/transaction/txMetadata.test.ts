import JSONBig from "json-bigint";
import { Metadata } from "@meshsdk/common";
import { mergeAllMetadataByTag } from "@meshsdk/transaction";

describe("Transaction Metadata Merge", () => {

  const createMetadataArray = (arr: { tag: string, metadata: any }[]): Metadata[] => {
    for (const elem of arr) {
      elem.metadata = JSONBig.stringify(elem.metadata);
    }
    return arr;
  };

  it("should merge two identical number metadata entries", () => {
    const input = createMetadataArray([
      { tag: "0", metadata: 42 },
      { tag: "0", metadata: 42 },
    ]);
    const expectedOutput = createMetadataArray([
      { tag: "0", metadata: 42 },
    ]);
    const output = mergeAllMetadataByTag(input, "0", true);
    expect(output).toEqual(expectedOutput);
  });
  it("should merge two identical string metadata entries", () => {
    const input = createMetadataArray([
      { tag: "1", metadata: "42" },
      { tag: "1", metadata: "42" },
    ]);
    const expectedOutput = createMetadataArray([
      { tag: "1", metadata: "42" },
    ]);
    const output = mergeAllMetadataByTag(input, "1", true);
    expect(output).toEqual(expectedOutput);
  });
  it("should not merge two different numbers", () => {
    const input = createMetadataArray([
      { tag: "1", metadata: 42 },
      { tag: "1", metadata: 43 },
    ]);
    expect(() => mergeAllMetadataByTag(input, "1", true)).toThrow("cannot merge 42 with 43");
  });
  it("should not merge two different strings", () => {
    const input = createMetadataArray([
      { tag: "0", metadata: "Alice" },
      { tag: "0", metadata: "Bob" },
    ]);
    expect(() => mergeAllMetadataByTag(input, "0", true)).toThrow("cannot merge Alice with Bob");
  });
  it("should not merge two same values of different types", () => {
    const input = createMetadataArray([
      { tag: "0", metadata: 42 },
      { tag: "0", metadata: "42" },
    ]);
    expect(() => mergeAllMetadataByTag(input, "0", true)).toThrow("cannot merge 42 with 42");
  });
  it("should replace with the latest item if there is no merge", () => {
    const input = createMetadataArray([
      { tag: "1", metadata: 42 },
      { tag: "1", metadata: 43 },
    ]);
    const expectedOutput = createMetadataArray([
      { tag: "1", metadata: 43 },
    ]);
    expect(mergeAllMetadataByTag(input, "1", false)).toEqual(expectedOutput);
  });

  it("should not merge two different values of the same object key", () => {
    const input = createMetadataArray([
      { tag: "721", metadata: { version: 1 } },
      { tag: "721", metadata: { version: 2 } },
    ]);
    expect(() => mergeAllMetadataByTag(input, "721", 2)).toThrow("cannot merge 1 with 2");
  });
  it("should replace with the latest value of the same object key if values are not merged", () => {
    const input = createMetadataArray([
      { tag: "721", metadata: { version: 1 } },
      { tag: "721", metadata: { version: 2 } },
    ]);
    const expectedOutput = createMetadataArray([
      { tag: "721", metadata: { version: 2 } },
    ]);
    expect(mergeAllMetadataByTag(input, "721", 1)).toEqual(expectedOutput);
    expect(mergeAllMetadataByTag(input, "721", true)).toEqual(expectedOutput);
  });
  it("should not merge different types", () => {
    expect(() => mergeAllMetadataByTag(
      createMetadataArray([
        { tag: "0", metadata: 0 },
        { tag: "0", metadata: [] }
      ]),
      "0",
      true
    )).toThrow("cannot merge primitive type with array type");
    expect(() => mergeAllMetadataByTag(
      createMetadataArray([
        { tag: "0", metadata: {} },
        { tag: "0", metadata: "" }
      ]),
      "0",
      true
    )).toThrow("cannot merge object type with primitive type");
    expect(() => mergeAllMetadataByTag(
      createMetadataArray([
        { tag: "0", metadata: {} },
        { tag: "0", metadata: [] }
      ]),
      "0",
      true
    )).toThrow("cannot merge object type with array type");
  });
  it("should preserve object key and value if merged with a nullish value", () => {
    expect(mergeAllMetadataByTag(
      createMetadataArray([
        { tag: "0", metadata: { value: 1 } },
        { tag: "0", metadata: { value: null } }
      ]),
      "0",
      2
    )).toEqual(createMetadataArray([
      { tag: "0", metadata: { value: 1 } }
    ]));
    expect(mergeAllMetadataByTag(
      createMetadataArray([
        { tag: "0", metadata: { value: 1 } },
        { tag: "0", metadata: { value: undefined } }
      ]),
      "0",
      true
    )).toEqual(createMetadataArray([
      { tag: "0", metadata: { value: 1 } }
    ]));
  });

  it("should replace 674 standard msg array for default merge depth", () => {
    const input = createMetadataArray([
      { tag: "674", metadata: { msg: ["A", "B", "C"] } },
      { tag: "674", metadata: { msg: ["D", "E", "F"] } },
      { tag: "674", metadata: { msg2: ["X", "Y", "Z"] } },
    ]);

    const expectedOutput = createMetadataArray([
      {
        tag: "674", metadata: {
          msg: ["D", "E", "F"],
          msg2: ["X", "Y", "Z"]
        }
      }
    ]);

    expect(mergeAllMetadataByTag(input, "674", 1)).toEqual(expectedOutput);
    expect(mergeAllMetadataByTag(input, "674", true)).toEqual(expectedOutput);
  });

  it("should concatenate 674 standard msg arrays for merge depth 2", () => {
    const input = createMetadataArray([
      { tag: "674", metadata: { msg: ["A", "B", "C"] } },
      { tag: "674", metadata: { msg: ["D", "E", "F"] } },
      { tag: "674", metadata: { msg2: ["X", "Y", "Z"] } },
    ]);

    const expectedOutput = createMetadataArray([
      {
        tag: "674", metadata: {
          msg: ["A", "B", "C", "D", "E", "F"],
          msg2: ["X", "Y", "Z"]
        }
      }
    ]);

    expect(mergeAllMetadataByTag(input, "674", 2)).toEqual(expectedOutput);
  });

  it("should merge multiple CIP-25 NFTs metadata under the same policy id", () => {
    const input: Metadata[] = createMetadataArray([
      {
        tag: "721",
        metadata: {
          "policyId1": {
            "My NFT 1": {
              "name": "My NFT 1"
            }
          }
        }
      },
      {
        tag: "721",
        metadata: {
          "policyId1": {
            "My NFT 2": {
              "name": "My NFT 2",
              "description": "My second NFT"
            }
          }
        }
      }
    ]);

    const expectedOutput: Metadata[] = createMetadataArray([
      {
        tag: "721",
        metadata: {
          "policyId1": {
            "My NFT 1": {
              "name": "My NFT 1"
            },
            "My NFT 2": {
              "name": "My NFT 2",
              "description": "My second NFT"
            }
          }
        }
      }
    ]);

    expect(mergeAllMetadataByTag(input, "721", 2)).toEqual(expectedOutput);
  });

  it("should merge multiple CIP-25 NFTs metadata under different policy ids", () => {
    const input = createMetadataArray([
      {
        tag: "721",
        metadata: {
          "policyId1": {
            "My NFT 1": {
              "name": "My NFT 1",
              "files": [
                { name: "NFT 1 Image", src: "xyz", mediaType: "image/jpeg" }
              ]
            }
          }
        }
      },
      {
        tag: "721",
        metadata: {
          "policyId2": {
            "My NFT 1": {
              "name": "My NFT 1 Policy 2",
              "files": [
                { name: "NFT 1 P 2", src: "abc", mediaType: "image/png" }
              ]
            }
          }
        }
      },
      {
        tag: "721",
        metadata: {
          "policyId1": {
            "My NFT 2": {
              "name": "My NFT 2",
              "files": [
                { name: "NFT 2 Image", src: "pqr", mediaType: "image/jpeg" }
              ]
            }
          }
        }
      }
    ]);

    const expectedOutput = createMetadataArray([
      {
        tag: "721",
        metadata: {
          "policyId1": {
            "My NFT 1": {
              "name": "My NFT 1",
              "files": [
                { name: "NFT 1 Image", src: "xyz", mediaType: "image/jpeg" }
              ]
            },
            "My NFT 2": {
              "name": "My NFT 2",
              "files": [
                { name: "NFT 2 Image", src: "pqr", mediaType: "image/jpeg" }
              ]
            }
          },
          "policyId2": {
            "My NFT 1": {
              "name": "My NFT 1 Policy 2",
              "files": [
                { name: "NFT 1 P 2", src: "abc", mediaType: "image/png" }
              ]
            }
          }
        }
      }
    ]);

    expect(mergeAllMetadataByTag(input, "721", 2)).toEqual(expectedOutput);
  });

  it("should replace with the latest CIP-25 NFT metadata of the same policy and asset id", () => {
    const input = createMetadataArray([
      {
        tag: "721",
        metadata: {
          "policyId1": {
            "My NFT 1": { name: "NFT 1 Name", files: [{ name: "NFT Image" }] }  // old metadata here
          }
        }
      },
      {
        tag: "721",
        metadata: {
          "policyId1": {
            "My NFT 2": { name: "NFT 2 Name" }
          }
        }
      },
      {
        tag: "721",
        metadata: {
          "policyId1": {
            "My NFT 1": { name: "Latest NFT 1", image: "xyz", description: "Latest NFT here" }
          }
        }
      }
    ]);

    const expectedOutput = createMetadataArray([
      {
        tag: "721",
        metadata: {
          "policyId1": {
            "My NFT 1": { name: "Latest NFT 1", image: "xyz", description: "Latest NFT here" },
            "My NFT 2": { name: "NFT 2 Name" }
          }
        }
      }
    ]);

    expect(mergeAllMetadataByTag(input, "721", 2)).toEqual(expectedOutput);
  });

  it("should attach version to CIP-25 metadata", () => {
    const input = createMetadataArray([
      {
        tag: "721",
        metadata: {
          "policyId1": { "My NFT 1": { name: "My NFT 1" } }
        }
      },
      {
        tag: "721",
        metadata: {
          "policyId1": { "My NFT 2": { name: "My NFT 2" } }
        }
      },
      {
        tag: "721",
        metadata: {
          version: "1.0"
        }
      },
      {
        tag: "721",
        metadata: {
          "policyId2": { "My NFT 1": { name: "My NFT 1 Policy 2" } }
        }
      }
    ]);

    const expectedOutput = createMetadataArray([
      {
        tag: "721",
        metadata: {
          "policyId1": {
            "My NFT 1": { name: "My NFT 1" },
            "My NFT 2": { name: "My NFT 2" }
          },
          "version": "1.0",                 // version inserted in an ordered manner
          "policyId2": {
            "My NFT 1": { name: "My NFT 1 Policy 2" }
          }
        }
      }
    ]);

    expect(mergeAllMetadataByTag(input, "721", 2)).toEqual(expectedOutput);
  });

  it("should preserve metadata entries with other tags in the original order", () => {
    const input = createMetadataArray([
      { tag: "0", metadata: "line 1" },
      { tag: "0", metadata: "line 2" },
      { tag: "674", metadata: { msg: ["line 3"] } },
      { tag: "721", metadata: { policyId: { NFT: { name: "NFT" } } } },
      { tag: "674", metadata: { msg: ["line 5"] } },
      { tag: "721", metadata: { policyId: { NFT2: { name: "NFT 2" } } } },
      { tag: "1", metadata: "line 7" },
    ]);

    const expectedOutput1 = createMetadataArray([
      { tag: "0", metadata: "line 1" },
      { tag: "0", metadata: "line 2" },
      { tag: "674", metadata: { msg: ["line 3"] } },
      { tag: "674", metadata: { msg: ["line 5"] } },
      { tag: "1", metadata: "line 7" },
      { tag: "721", metadata: { policyId: { NFT: { name: "NFT" }, NFT2: { name: "NFT 2" } } } },
    ]);

    expect(mergeAllMetadataByTag(input, "721", 2)).toEqual(expectedOutput1);

    const expectedOutput2 = createMetadataArray([
      { tag: "0", metadata: "line 1" },
      { tag: "0", metadata: "line 2" },
      { tag: "1", metadata: "line 7" },
      { tag: "721", metadata: { policyId: { NFT: { name: "NFT" }, NFT2: { name: "NFT 2" } } } },
      { tag: "674", metadata: { msg: ["line 5"] } },
    ]);

    expect(mergeAllMetadataByTag(expectedOutput1, "674", true)).toEqual(expectedOutput2);
  });
});
