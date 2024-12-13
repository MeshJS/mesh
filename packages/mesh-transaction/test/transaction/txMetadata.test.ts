import { mergeContents, metadataObjToMap } from "@meshsdk/transaction";

describe("Transaction Metadata Merge", () => {
  it("should merge two identical number metadata entries", () => {
    const currentMetadata = 42;
    const newMetadata = 42;
    const expectedOutput = 42;
    mergeContents(currentMetadata, newMetadata, 1);
    expect(currentMetadata).toEqual(expectedOutput);
  });
  it("should merge two identical string metadata entries", () => {
    const currentMetadata = "Hey!";
    const newMetadata = "Hey!";
    const expectedOutput = "Hey!";
    mergeContents(currentMetadata, newMetadata, 1);
    expect(currentMetadata).toEqual(expectedOutput);
  });
  it("should not merge two different numbers", () => {
    const currentMetadata = 42;
    const newMetadata = 43;
    expect(() => mergeContents(currentMetadata, newMetadata, 1)).toThrow("cannot merge 42 with 43");
  });
  it("should not merge two different strings", () => {
    const currentMetadata = "Alice";
    const newMetadata = "Bob";
    expect(() => mergeContents(currentMetadata, newMetadata, 1)).toThrow("cannot merge \"Alice\" with \"Bob\"");
  });
  it("should not merge two same values of different types", () => {
    const currentMetadata = 42;
    const newMetadata = "42";
    expect(() => mergeContents(currentMetadata, newMetadata, 1)).toThrow("cannot merge 42 with \"42\"");
  });
  it("should return the latest item if there is no merge", () => {
    const currentMetadata = 42;
    const newMetadata = 43;
    const expectedOutput = 43;
    // `currentMetadata` remains unchanged here
    expect(mergeContents(currentMetadata, newMetadata, 0)).toEqual(expectedOutput);
  });

  it("should not merge two different values of the same object key", () => {
    const currentMetadata = metadataObjToMap({ version: 1 });
    const newMetadata = metadataObjToMap({ version: 2 });
    expect(() => mergeContents(currentMetadata, newMetadata, 2)).toThrow("cannot merge 1 with 2");
  });
  it("should replace with the latest value of the same object key if values are not merged", () => {
    const currentMetadata = metadataObjToMap({ version: 1 });
    const newMetadata = metadataObjToMap({ version: 2 });
    const expectedOutput = metadataObjToMap({ version: 2 });
    mergeContents(currentMetadata, newMetadata, 1);
    expect(currentMetadata).toEqual(expectedOutput);
  });
  it("should not merge different types", () => {
    expect(() => mergeContents(
      metadataObjToMap(0),
      metadataObjToMap([]),
      1
    )).toThrow("cannot merge primitive type with array type");
    expect(() => mergeContents(
      metadataObjToMap({}),
      metadataObjToMap(""),
      1
    )).toThrow("cannot merge map type with primitive type");
    expect(() => mergeContents(
      metadataObjToMap({}),
      metadataObjToMap([]),
      1
    )).toThrow("cannot merge map type with array type");
  });
  it("plain object to map conversion should not allow nullish values", () => {
    expect(() => metadataObjToMap(null)).toThrow("Unsupported metadata type");
    expect(() => metadataObjToMap({ "value": null })).toThrow("Unsupported metadata type");
  });

  it("should replace 674 standard msg array for merge depth 1", () => {
    const currentMetadata = metadataObjToMap({
      msg: ["A", "B", "C"],
      msg2: ["X", "Y", "Z"]
    });
    const newMetadata = metadataObjToMap({
      msg: ["D", "E", "F"]
    });
    const expectedOutput = metadataObjToMap({
      msg: ["D", "E", "F"],
      msg2: ["X", "Y", "Z"]
    });
    mergeContents(currentMetadata, newMetadata, 1);
    expect(currentMetadata).toEqual(expectedOutput);
  });

  it("should concatenate 674 standard msg arrays for merge depth 2", () => {
    const currentMetadata = metadataObjToMap({
      msg: ["A", "B", "C"],
      msg2: ["X", "Y", "Z"]
    });
    const newMetadata = metadataObjToMap({
      msg: ["D", "E", "F"]
    });
    const expectedOutput = metadataObjToMap({
      msg: ["A", "B", "C", "D", "E", "F"],
      msg2: ["X", "Y", "Z"]
    });
    mergeContents(currentMetadata, newMetadata, 2);
    expect(currentMetadata).toEqual(expectedOutput);
  });

  it("should merge multiple CIP-25 NFTs metadata under the same policy id", () => {
    const currentMetadata = metadataObjToMap({
      "policyId1": {
        "My NFT 1": {
          "name": "My NFT 1"
        }
      }
    });
    const newMetadata = metadataObjToMap({
      "policyId1": {
        "My NFT 2": {
          "name": "My NFT 2",
          "description": "My second NFT"
        }
      }
    });
    const expectedOutput = metadataObjToMap({
      "policyId1": {
        "My NFT 1": {
          "name": "My NFT 1"
        },
        "My NFT 2": {
          "name": "My NFT 2",
          "description": "My second NFT"
        }
      }
    });
    mergeContents(currentMetadata, newMetadata, 2);
    expect(currentMetadata).toEqual(expectedOutput);
  });

  it("should merge multiple CIP-25 NFTs metadata under different policy ids", () => {
    const currentMetadata = metadataObjToMap({
      "policyId1": {
        "My NFT 1": {
          "name": "My NFT 1",
          "files": [
            { name: "NFT 1 Image", src: "xyz", mediaType: "image/jpeg" }
          ]
        }
      }
    });
    const newMetadata1 = metadataObjToMap({
      "policyId2": {
        "My NFT 1": {
          "name": "My NFT 1 Policy 2",
          "files": [
            { name: "NFT 1 P 2", src: "abc", mediaType: "image/png" }
          ]
        }
      }
    });
    const expectedOutput1 = metadataObjToMap({
      "policyId1": {
        "My NFT 1": {
          "name": "My NFT 1",
          "files": [
            { name: "NFT 1 Image", src: "xyz", mediaType: "image/jpeg" }
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
    });
    mergeContents(currentMetadata, newMetadata1, 2);
    expect(currentMetadata).toEqual(expectedOutput1);
    // Merge more NFT metadata
    const newMetadata2 = metadataObjToMap({
      "policyId1": {
        "My NFT 2": {
          "name": "My NFT 2",
          "files": [
            { name: "NFT 2 Image", src: "pqr", mediaType: "image/jpeg" }
          ]
        }
      }
    });
    const expectedOutput2 = metadataObjToMap({
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
    });
    mergeContents(currentMetadata, newMetadata2, 2);
    expect(currentMetadata).toEqual(expectedOutput2);
  });

  it("should replace with the latest CIP-25 NFT metadata of the same policy and asset id", () => {
    const currentMetadata = metadataObjToMap({
      "policyId1": {
        "My NFT 1": { name: "NFT 1 Name", files: [{ name: "NFT Image" }] },   // old metadata here
        "My NFT 2": { name: "NFT 2 Name" }
      }
    });
    const newMetadata = metadataObjToMap({
      "policyId1": {
        "My NFT 1": { name: "Latest NFT 1", image: "xyz", description: "Latest NFT here" }
      }
    });
    const expectedOutput = metadataObjToMap({
      "policyId1": {
        "My NFT 1": { name: "Latest NFT 1", image: "xyz", description: "Latest NFT here" },
        "My NFT 2": { name: "NFT 2 Name" }
      }
    });
    mergeContents(currentMetadata, newMetadata, 2);
    expect(currentMetadata).toEqual(expectedOutput);
  });

  it("should attach version to CIP-25 metadata", () => {
    const currentMetadata = metadataObjToMap({
      "policyId1": { "My NFT 1": { name: "My NFT 1" } },
      "policyId2": { "My NFT 1": { name: "My NFT 1 Policy 2" } }
    });
    const newMetadata = metadataObjToMap({
      version: 1
    });
    const expectedOutput = metadataObjToMap({
      "policyId1": { "My NFT 1": { name: "My NFT 1" } },
      "policyId2": { "My NFT 1": { name: "My NFT 1 Policy 2" } },
      "version": 1
    });
    mergeContents(currentMetadata, newMetadata, 2);
    expect(currentMetadata).toEqual(expectedOutput);
  });

  it("should preserve metadata entries with other tags in the original order", () => {
    const currentMetadata = new Map([
      [0n, metadataObjToMap("line 1")],
      [674n, metadataObjToMap({ msg: "line 2" })],
      [721n, metadataObjToMap({ policyId1: { NFT1: { name: "line 3" } } })],
      [1n, metadataObjToMap("line 4")]
    ]);
    const newMetadata = new Map([
      [721n, metadataObjToMap({ policyId1: { NFT2: { name: "line 5" } } })]
    ]);
    const expectedOutput = new Map([
      [0n, metadataObjToMap("line 1")],
      [674n, metadataObjToMap({ msg: "line 2" })],
      [721n, metadataObjToMap({ policyId1: { NFT1: { name: "line 3" }, NFT2: { name: "line 5" } } })],
      [1n, metadataObjToMap("line 4")]
    ]);
    mergeContents(currentMetadata, newMetadata, 3);
    expect(currentMetadata).toEqual(expectedOutput);
  });
});
