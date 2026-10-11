import { transactionWitnessSetPrototypeToCardano } from "../../src/tx-prototype-to-cbor/witness-set";
import { RedeemerTag } from "../../src/types";

const PUBKEY = "dd".repeat(32);
const SIGNATURE = "ee".repeat(64);

const redeemer = (tag: "SPEND" | "MINT" | "CERT" | "REWARD" | "VOTE" | "VOTING_PROPOSAL") => ({
  data: { type: "CBOR" as const, hex: "01" }, // CBOR for the integer 1
  ex_units: { mem: "1000", steps: "500" },
  index: "0",
  tag: { type: tag },
});

describe("transactionWitnessSetPrototypeToCardano", () => {
  it("returns an empty witness set for an empty prototype", () => {
    const ws = transactionWitnessSetPrototypeToCardano({});
    expect(ws.vkeys()).toBeUndefined();
    expect(ws.redeemers()).toBeUndefined();
  });

  it("converts vkeys", () => {
    const ws = transactionWitnessSetPrototypeToCardano({
      vkeys: [{ vkey: PUBKEY, signature: SIGNATURE }],
    });
    const vkeys = [...ws.vkeys()!.values()];
    expect(vkeys).toHaveLength(1);
    expect(vkeys[0]!.vkey().toString()).toEqual(PUBKEY);
    expect(vkeys[0]!.signature().toString()).toEqual(SIGNATURE);
  });

  it.each([
    ["SPEND", RedeemerTag.Spend],
    ["MINT", RedeemerTag.Mint],
    ["CERT", RedeemerTag.Cert],
    ["REWARD", RedeemerTag.Reward],
    ["VOTE", RedeemerTag.Voting],
    ["VOTING_PROPOSAL", RedeemerTag.Proposing],
  ] as const)("maps redeemer tag %s to RedeemerTag.%s", (protoTag, expected) => {
    const ws = transactionWitnessSetPrototypeToCardano({ redeemers: [redeemer(protoTag)] });
    const [red] = [...ws.redeemers()!.values()];
    expect(red!.tag()).toEqual(expected);
    expect(red!.index()).toEqual(0n);
    expect(red!.exUnits().mem()).toEqual(1000n);
    expect(red!.exUnits().steps()).toEqual(500n);
    expect(red!.data().asInteger()).toEqual(1n);
  });

  it("converts native_scripts via structured NativeScriptPrototype", () => {
    const ws = transactionWitnessSetPrototypeToCardano({
      native_scripts: [{ type: "SCRIPT_PUBKEY", value: { addr_keyhash: "aa".repeat(28) } }],
    });
    const scripts = [...ws.nativeScripts()!.values()];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.asScriptPubkey()!.keyHash().toString()).toEqual("aa".repeat(28));
  });

  it("routes each plutus script version to its own CDDL key (3/6/7), no version guessing", () => {
    // Any valid-looking script hex is fine — this checks witness-set wiring, not execution.
    const scriptCbor = "4d01000033222220051200120011";
    const ws = transactionWitnessSetPrototypeToCardano({
      plutus_v1_scripts: [scriptCbor],
      plutus_v2_scripts: [scriptCbor],
      plutus_v3_scripts: [scriptCbor],
    });
    expect([...ws.plutusV1Scripts()!.values()]).toHaveLength(1);
    expect([...ws.plutusV2Scripts()!.values()]).toHaveLength(1);
    expect([...ws.plutusV3Scripts()!.values()]).toHaveLength(1);
  });

  it("does not put a V3 script into the V1 bucket (regression: old single-field shape did)", () => {
    const ws = transactionWitnessSetPrototypeToCardano({
      plutus_v3_scripts: ["4d01000033222220051200120011"],
    });
    expect(ws.plutusV1Scripts()).toBeUndefined();
    expect([...ws.plutusV3Scripts()!.values()]).toHaveLength(1);
  });

  it("converts plutus_data as raw CBOR datum witnesses", () => {
    const ws = transactionWitnessSetPrototypeToCardano({
      plutus_data: { elems: ["01"] }, // CBOR for the integer 1
    });
    const [datum] = [...ws.plutusData()!.values()];
    expect(datum!.asInteger()).toEqual(1n);
  });

  it("converts bootstraps", () => {
    const ws = transactionWitnessSetPrototypeToCardano({
      bootstraps: [
        {
          attributes: [1, 2, 3],
          chain_code: [4, 5, 6, 7],
          signature: SIGNATURE,
          vkey: PUBKEY,
        },
      ],
    });
    const [bootstrap] = [...ws.bootstraps()!.values()];
    expect(bootstrap!.vkey().toString()).toEqual(PUBKEY);
    expect(bootstrap!.chainCode().toString()).toEqual("04050607");
    expect(bootstrap!.attributes().toString()).toEqual("010203");
  });
});
