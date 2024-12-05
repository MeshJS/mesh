import { metadataObjToMap, setAndMergeTxMetadata } from "@meshsdk/transaction";

describe("Transaction Metadata Merge", () => {
  it("should merge two identical number metadata entries", () => {
    const txMetadata = new Map([
      [0n, 42]
    ]);
    const label = 0n;
    const metadata = 42;
    const expectedOutput = new Map([
      [0n, 42]
    ]);
    setAndMergeTxMetadata(txMetadata, label, metadata, true);
    expect(txMetadata).toEqual(expectedOutput);
  });
  it("should merge two identical string metadata entries", () => {
    const txMetadata = new Map([
      [1n, "Hey!"]
    ]);
    const label = 1n;
    const metadata = "Hey!";
    const expectedOutput = new Map([
      [1n, "Hey!"]
    ]);
    setAndMergeTxMetadata(txMetadata, label, metadata, true);
    expect(txMetadata).toEqual(expectedOutput);
  });
  it("should not merge two different numbers", () => {
    const txMetadata = new Map([
      [1n, 42]
    ]);
    const label = 1n;
    const metadata = 43;
    expect(() => setAndMergeTxMetadata(txMetadata, label, metadata, true)).toThrow("cannot merge 42 with 43");
  });
  it("should not merge two different strings", () => {
    const txMetadata = new Map([
      [0n, "Alice"]
    ]);
    const label = 0n;
    const metadata = "Bob";
    expect(() => setAndMergeTxMetadata(txMetadata, label, metadata, true)).toThrow("cannot merge \"Alice\" with \"Bob\"");
  });
  it("should not merge two same values of different types", () => {
    const txMetadata = new Map([
      [0n, 42]
    ]);
    const label = 0n;
    const metadata = "42";
    expect(() => setAndMergeTxMetadata(txMetadata, label, metadata, true)).toThrow("cannot merge 42 with \"42\"");
  });
  it("should replace with the latest item if there is no merge", () => {
    const txMetadata = new Map([
      [1n, 42]
    ]);
    const label = 1n;
    const metadata = 43;
    const expectedOutput = new Map([
      [1n, 43]
    ]);
    setAndMergeTxMetadata(txMetadata, label, metadata, false);
    expect(txMetadata).toEqual(expectedOutput);
  });

  it("should not merge two different values of the same object key", () => {
    const txMetadata = new Map([
      [721n, metadataObjToMap({ version: 1 })]
    ]);
    const label = 721n;
    const metadata = metadataObjToMap({ version: 2 });
    expect(() => setAndMergeTxMetadata(txMetadata, label, metadata, 2)).toThrow("cannot merge 1 with 2");
  });
  it("should replace with the latest value of the same object key if values are not merged", () => {
    const txMetadata = new Map([
      [721n, metadataObjToMap({ version: 1 })]
    ]);
    const label = 721n;
    const metadata = metadataObjToMap({ version: 2 });
    const expectedOutput = new Map([
      [721n, metadataObjToMap({ version: 2 })]
    ]);
    setAndMergeTxMetadata(txMetadata, label, metadata, 1);
    expect(txMetadata).toEqual(expectedOutput);
  });
  it("should not merge different types", () => {
    expect(() => setAndMergeTxMetadata(
      new Map([[0n, 0]]),
      0n,   // label
      [],   // metadata
      true
    )).toThrow("cannot merge primitive type with array type");
    expect(() => setAndMergeTxMetadata(
      new Map([[0n, metadataObjToMap({})]]),
      0n,   // label
      "",   // metadata
      true
    )).toThrow("cannot merge map type with primitive type");
    expect(() => setAndMergeTxMetadata(
      new Map([[0n, metadataObjToMap({})]]),
      0n,   // label
      [],   // metadata
      true
    )).toThrow("cannot merge map type with array type");
  });
  it("plain object to map conversion should not allow nullish values", () => {
    expect(() => metadataObjToMap({ "value": null })).toThrow("Unsupported metadata type");
  });

  it("should replace 674 standard msg array for default merge depth", () => {
    const txMetadata = new Map([
      [
        674n,
        metadataObjToMap({
          msg: ["A", "B", "C"],
          msg2: ["X", "Y", "Z"]
        })
      ]
    ]);
    const label = 674n;
    const metadata = metadataObjToMap({
      msg: ["D", "E", "F"]
    });
    const expectedOutput = new Map([
      [
        674n,
        metadataObjToMap({
          msg: ["D", "E", "F"],
          msg2: ["X", "Y", "Z"]
        })
      ]
    ]);
    setAndMergeTxMetadata(txMetadata, label, metadata, true);
    expect(txMetadata).toEqual(expectedOutput);
  });

  it("should concatenate 674 standard msg arrays for merge depth 2", () => {
    const txMetadata = new Map([
      [
        674n,
        metadataObjToMap({
          msg: ["A", "B", "C"],
          msg2: ["X", "Y", "Z"]
        })
      ]
    ]);
    const label = 674n;
    const metadata = metadataObjToMap({
      msg: ["D", "E", "F"]
    });
    const expectedOutput = new Map([
      [
        674n,
        metadataObjToMap({
          msg: ["A", "B", "C", "D", "E", "F"],
          msg2: ["X", "Y", "Z"]
        })
      ]
    ]);
    setAndMergeTxMetadata(txMetadata, label, metadata, 2);
    expect(txMetadata).toEqual(expectedOutput);
  });

  it("should merge multiple CIP-25 NFTs metadata under the same policy id", () => {
    const txMetadata = new Map([
      [
        721n,
        metadataObjToMap({
          "policyId1": {
            "My NFT 1": {
              "name": "My NFT 1"
            }
          }
        })
      ]
    ]);
    const label = 721n;
    const metadata = metadataObjToMap({
      "policyId1": {
        "My NFT 2": {
          "name": "My NFT 2",
          "description": "My second NFT"
        }
      }
    });
    const expectedOutput = new Map([
      [
        721n,
        metadataObjToMap({
          "policyId1": {
            "My NFT 1": {
              "name": "My NFT 1"
            },
            "My NFT 2": {
              "name": "My NFT 2",
              "description": "My second NFT"
            }
          }
        })
      ]
    ]);
    setAndMergeTxMetadata(txMetadata, label, metadata, 2);
    expect(txMetadata).toEqual(expectedOutput);
  });

  it("should merge multiple CIP-25 NFTs metadata under different policy ids", () => {
    const txMetadata = new Map([
      [
        721n,
        metadataObjToMap({
          "policyId1": {
            "My NFT 1": {
              "name": "My NFT 1",
              "files": [
                { name: "NFT 1 Image", src: "xyz", mediaType: "image/jpeg" }
              ]
            }
          }
        })
      ]
    ]);
    const label = 721n;
    const metadata1 = metadataObjToMap({
      "policyId2": {
        "My NFT 1": {
          "name": "My NFT 1 Policy 2",
          "files": [
            { name: "NFT 1 P 2", src: "abc", mediaType: "image/png" }
          ]
        }
      }
    });
    const expectedOutput1 = new Map([
      [
        721n,
        metadataObjToMap({
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
        })
      ]
    ]);
    setAndMergeTxMetadata(txMetadata, label, metadata1, 2);
    expect(txMetadata).toEqual(expectedOutput1);
    // Merge more NFT metadata
    const metadata2 = metadataObjToMap({
      "policyId1": {
        "My NFT 2": {
          "name": "My NFT 2",
          "files": [
            { name: "NFT 2 Image", src: "pqr", mediaType: "image/jpeg" }
          ]
        }
      }
    });
    const expectedOutput2 = new Map([
      [
        721n,
        metadataObjToMap({
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
        })
      ]
    ]);
    setAndMergeTxMetadata(txMetadata, label, metadata2, 2);
    expect(txMetadata).toEqual(expectedOutput2);
  });

  it("should replace with the latest CIP-25 NFT metadata of the same policy and asset id", () => {
    const txMetadata = new Map([
      [
        721n,
        metadataObjToMap({
          "policyId1": {
            "My NFT 1": { name: "NFT 1 Name", files: [{ name: "NFT Image" }] },   // old metadata here
            "My NFT 2": { name: "NFT 2 Name" }
          }
        })
      ]
    ]);
    const label = 721n;
    const metadata = metadataObjToMap({
      "policyId1": {
        "My NFT 1": { name: "Latest NFT 1", image: "xyz", description: "Latest NFT here" }
      }
    });
    const expectedOutput = new Map([
      [
        721n,
        metadataObjToMap({
          "policyId1": {
            "My NFT 1": { name: "Latest NFT 1", image: "xyz", description: "Latest NFT here" },
            "My NFT 2": { name: "NFT 2 Name" }
          }
        })
      ]
    ]);
    setAndMergeTxMetadata(txMetadata, label, metadata, 2);
    expect(txMetadata).toEqual(expectedOutput);
  });

  it("should attach version to CIP-25 metadata", () => {
    const txMetadata = new Map([
      [
        721n,
        metadataObjToMap({
          "policyId1": { "My NFT 1": { name: "My NFT 1" } },
          "policyId2": { "My NFT 1": { name: "My NFT 1 Policy 2" } }
        })
      ]
    ]);
    const label = 721n;
    const metadata = metadataObjToMap({
      version: 1
    });
    const expectedOutput = new Map([
      [
        721n,
        metadataObjToMap({
          "policyId1": { "My NFT 1": { name: "My NFT 1" } },
          "policyId2": { "My NFT 1": { name: "My NFT 1 Policy 2" } },
          "version": 1
        })
      ]
    ]);
    setAndMergeTxMetadata(txMetadata, label, metadata, 2);
    expect(txMetadata).toEqual(expectedOutput);
  });

  it("should preserve metadata entries with other tags in the original order", () => {
    const txMetadata = new Map([
      [0n, metadataObjToMap("line 1")],
      [674n, metadataObjToMap({ msg: "line 2" })],
      [721n, metadataObjToMap({ policyId1: { NFT1: { name: "line 3" } } })],
      [1n, metadataObjToMap("line 4")]
    ]);
    const label = 721n;
    const metadata = metadataObjToMap({ policyId1: { NFT2: { name: "line 5" } } });
    const expectedOutput = new Map([
      [0n, metadataObjToMap("line 1")],
      [674n, metadataObjToMap({ msg: "line 2" })],
      [721n, metadataObjToMap({ policyId1: { NFT1: { name: "line 3" }, NFT2: { name: "line 5" } } })],
      [1n, metadataObjToMap("line 4")]
    ]);
    setAndMergeTxMetadata(txMetadata, label, metadata, 2);
    expect(txMetadata).toEqual(expectedOutput);
  });
});
