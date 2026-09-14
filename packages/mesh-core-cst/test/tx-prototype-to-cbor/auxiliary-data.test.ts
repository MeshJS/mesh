import { auxiliaryDataPrototypeToCardano } from "../../src/tx-prototype-to-cbor/auxiliary-data";

describe("auxiliaryDataPrototypeToCardano", () => {
  it("converts metadata labels/values", () => {
    const auxData = auxiliaryDataPrototypeToCardano({
      metadata: {
        "674": { type: "MAP", value: [[{ type: "STRING", value: "msg" }, { type: "STRING", value: "hello" }]] },
      },
      prefer_alonzo_format: true,
    });
    const entry = auxData.metadata()!.metadata()!.get(674n);
    expect(entry).toBeDefined();
  });

  it("converts native_scripts", () => {
    const auxData = auxiliaryDataPrototypeToCardano({
      native_scripts: [{ type: "SCRIPT_PUBKEY", value: { addr_keyhash: "aa".repeat(28) } }],
      prefer_alonzo_format: true,
    });
    const scripts = auxData.nativeScripts()!;
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.asScriptPubkey()!.keyHash().toString()).toEqual("aa".repeat(28));
  });

  it("returns an auxiliary data object with nothing set when the prototype is empty", () => {
    const auxData = auxiliaryDataPrototypeToCardano({ prefer_alonzo_format: true });
    expect(auxData.metadata()).toBeUndefined();
    expect(auxData.nativeScripts()).toBeUndefined();
  });
});
