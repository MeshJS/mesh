import { Output } from "@meshsdk/common";

import { cloneOutput } from "../src";

// Regression tests for https://github.com/MeshJS/mesh/issues/704
// cloneOutput previously used a JSON round-trip, which silently drops Map
// entries and mangles bigint values inside Mesh `Data` inline datums (e.g.
// CIP-68 metadata produced by metadataToCip68), causing
// "Cannot convert undefined to a BigInt" during serializeOutput.
describe("cloneOutput", () => {
  it("preserves a Map inside a Mesh Data inline datum", () => {
    const metadata = new Map<string, string>([
      ["name", "Mesh Token"],
      ["image", "ipfs://Qm..."],
    ]);

    const output: Output = {
      address: "addr_test1vqld...",
      amount: [{ unit: "lovelace", quantity: "2000000" }],
      datum: {
        type: "Inline",
        data: {
          type: "Mesh",
          // CIP-68-style constructor: { alternative, fields: [Map, version] }
          content: { alternative: 0, fields: [metadata, 1n] },
        },
      },
    };

    const cloned = cloneOutput(output);
    const clonedContent = cloned.datum!.data.content as {
      alternative: number;
      fields: unknown[];
    };
    const clonedMap = clonedContent.fields[0] as Map<string, string>;

    // The Map must survive cloning (JSON would have produced an empty object).
    // Use the toStringTag rather than `instanceof` so the assertion is robust to
    // the cross-realm Map that structuredClone yields inside the jest VM.
    expect(Object.prototype.toString.call(clonedMap)).toBe("[object Map]");
    expect(clonedMap.size).toBe(2);
    expect(clonedMap.get("name")).toBe("Mesh Token");
    expect(clonedMap.get("image")).toBe("ipfs://Qm...");

    // bigint must survive (JSON.stringify throws on / coerces bigint).
    expect(clonedContent.fields[1]).toBe(1n);
    expect(typeof clonedContent.fields[1]).toBe("bigint");
  });

  it("returns a deep copy that is independent of the original", () => {
    const output: Output = {
      address: "addr_test1vqld...",
      amount: [
        { unit: "lovelace", quantity: "2000000" },
        { unit: "abc123", quantity: "5" },
      ],
      datum: {
        type: "Inline",
        data: { type: "Mesh", content: { alternative: 0, fields: [42n] } },
      },
    };

    const cloned = cloneOutput(output);

    // Structurally equal...
    expect(cloned).toEqual(output);
    // ...but not the same references (mutating the clone must not touch source).
    expect(cloned).not.toBe(output);
    expect(cloned.amount).not.toBe(output.amount);

    cloned.amount[0]!.quantity = "999";
    expect(output.amount[0]!.quantity).toBe("2000000");
  });

  it("clones a plain ADA-only output", () => {
    const output: Output = {
      address: "addr_test1vqld...",
      amount: [{ unit: "lovelace", quantity: "1500000" }],
    };

    expect(cloneOutput(output)).toEqual(output);
  });
});
