import {
  transactionInputPrototypeToCardano,
  transactionOutputPrototypeToCardano,
} from "../../src/tx-prototype-to-cbor/inputs-outputs";
import { nativeScriptPrototypeToCardano } from "../../src/tx-prototype-to-cbor/native-script";
import { Script } from "../../src/types";

const TX_HASH = "11".repeat(32);
const ADDRESS =
  "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9";

describe("transactionInputPrototypeToCardano", () => {
  it("converts transaction_id/index", () => {
    const input = transactionInputPrototypeToCardano({ transaction_id: TX_HASH, index: 3 });
    expect(input.transactionId().toString()).toEqual(TX_HASH);
    expect(input.index()).toEqual(3n);
  });
});

describe("transactionOutputPrototypeToCardano", () => {
  it("converts a plain address + value output", () => {
    const output = transactionOutputPrototypeToCardano({
      address: ADDRESS,
      amount: { coin: "5000000" },
    });
    expect(output.address().toBech32()).toEqual(ADDRESS);
    expect(output.amount().coin()).toEqual(5000000n);
    expect(output.datum()).toBeUndefined();
    expect(output.scriptRef()).toBeUndefined();
  });

  it("sets a datum hash from DATA_HASH", () => {
    const hash = "22".repeat(32);
    const output = transactionOutputPrototypeToCardano({
      address: ADDRESS,
      amount: { coin: "5000000" },
      plutus_data: { type: "DATA_HASH", value: hash },
    });
    expect(output.datum()!.asDataHash()!.toString()).toEqual(hash);
  });

  it("sets an inline datum from DATA", () => {
    const output = transactionOutputPrototypeToCardano({
      address: ADDRESS,
      amount: { coin: "5000000" },
      plutus_data: {
        type: "DATA",
        value: { type: "MANUAL", data: { type: "INTEGER", value: 42n } },
      },
    });
    expect(output.datum()!.asInlineData()!.asInteger()).toEqual(42n);
  });

  it("sets a reference script from script_ref cbor", () => {
    const nativeScript = nativeScriptPrototypeToCardano({
      type: "SCRIPT_PUBKEY",
      value: { addr_keyhash: "aa".repeat(28) },
    });
    const scriptCbor = Script.newNativeScript(nativeScript).toCbor();
    const output = transactionOutputPrototypeToCardano({
      address: ADDRESS,
      amount: { coin: "5000000" },
      script_ref: scriptCbor,
    });
    expect(output.scriptRef()!.toCbor()).toEqual(scriptCbor);
  });

  it("converts amount with a multiasset", () => {
    const policyId = "aa".repeat(28);
    const output = transactionOutputPrototypeToCardano({
      address: ADDRESS,
      amount: { coin: "2000000", multiasset: { [policyId]: { "74657374": "10" } } },
    });
    expect(output.amount().multiasset()!.size).toEqual(1);
  });
});
