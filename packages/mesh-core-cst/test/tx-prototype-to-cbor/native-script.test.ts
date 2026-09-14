import { nativeScriptPrototypeToCardano } from "../../src/tx-prototype-to-cbor/native-script";

const KEY_HASH = "aa".repeat(28);

describe("nativeScriptPrototypeToCardano", () => {
  it("converts SCRIPT_PUBKEY", () => {
    const script = nativeScriptPrototypeToCardano({
      type: "SCRIPT_PUBKEY",
      value: { addr_keyhash: KEY_HASH },
    });
    expect(script.asScriptPubkey()!.keyHash().toString()).toEqual(KEY_HASH);
  });

  it("converts SCRIPT_ALL with nested scripts", () => {
    const script = nativeScriptPrototypeToCardano({
      type: "SCRIPT_ALL",
      value: {
        native_scripts: [{ type: "SCRIPT_PUBKEY", value: { addr_keyhash: KEY_HASH } }],
      },
    });
    const all = script.asScriptAll()!;
    expect(all.nativeScripts()).toHaveLength(1);
    expect(all.nativeScripts()[0]!.asScriptPubkey()!.keyHash().toString()).toEqual(KEY_HASH);
  });

  it("converts SCRIPT_ANY", () => {
    const script = nativeScriptPrototypeToCardano({
      type: "SCRIPT_ANY",
      value: {
        native_scripts: [{ type: "SCRIPT_PUBKEY", value: { addr_keyhash: KEY_HASH } }],
      },
    });
    expect(script.asScriptAny()!.nativeScripts()).toHaveLength(1);
  });

  it("converts SCRIPT_N_OF_K", () => {
    const script = nativeScriptPrototypeToCardano({
      type: "SCRIPT_N_OF_K",
      value: {
        n: 1n,
        native_scripts: [
          { type: "SCRIPT_PUBKEY", value: { addr_keyhash: KEY_HASH } },
          { type: "SCRIPT_PUBKEY", value: { addr_keyhash: "bb".repeat(28) } },
        ],
      },
    });
    const nOfK = script.asScriptNOfK()!;
    expect(nOfK.required()).toEqual(1);
    expect(nOfK.nativeScripts()).toHaveLength(2);
  });

  it("converts TIMELOCK_START", () => {
    const script = nativeScriptPrototypeToCardano({
      type: "TIMELOCK_START",
      value: { slot: "100" },
    });
    expect(script.asTimelockStart()!.slot().toString()).toEqual("100");
  });

  it("converts TIMELOCK_EXPIRY", () => {
    const script = nativeScriptPrototypeToCardano({
      type: "TIMELOCK_EXPIRY",
      value: { slot: "200" },
    });
    expect(script.asTimelockExpiry()!.slot().toString()).toEqual("200");
  });
});
