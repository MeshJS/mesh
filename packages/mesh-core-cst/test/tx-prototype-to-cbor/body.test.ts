import { transactionBodyPrototypeToCardano } from "../../src/tx-prototype-to-cbor/body";

const TX_HASH = "11".repeat(32);
const ADDRESS =
  "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9";
const REWARD_ACCOUNT = "stake_test1uqdgagy7x7mtcta2qyyg244efgtr57wg5mxa2wwnvrx845s4sa2vp";
const POLICY_ID = "aa".repeat(28);

const minimalBody = () => ({
  fee: "170000",
  inputs: [{ transaction_id: TX_HASH, index: 0 }],
  outputs: [{ address: ADDRESS, amount: { coin: "5000000" } }],
});

describe("transactionBodyPrototypeToCardano", () => {
  it("converts the required fields", () => {
    const body = transactionBodyPrototypeToCardano(minimalBody());
    expect(body.fee()).toEqual(170000n);
    expect([...body.inputs().values()]).toHaveLength(1);
    expect(body.outputs()).toHaveLength(1);
  });

  it("sets ttl/validity_start_interval", () => {
    const body = transactionBodyPrototypeToCardano({
      ...minimalBody(),
      ttl: "100000000",
      validity_start_interval: "99999000",
    });
    expect(body.ttl()!.toString()).toEqual("100000000");
    expect(body.validityStartInterval()!.toString()).toEqual("99999000");
  });

  it("sets mint as an AssetId -> quantity map", () => {
    const body = transactionBodyPrototypeToCardano({
      ...minimalBody(),
      mint: { [POLICY_ID]: { "6d696e74": "5" } },
    });
    const mint = body.mint()!;
    expect(mint.size).toEqual(1);
    expect([...mint.values()][0]).toEqual(5n);
  });

  it("sets withdrawals keyed by reward account", () => {
    const body = transactionBodyPrototypeToCardano({
      ...minimalBody(),
      withdrawals: { [REWARD_ACCOUNT]: "2000000" },
    });
    const withdrawals = body.withdrawals()!;
    expect(withdrawals.size).toEqual(1);
    expect([...withdrawals.values()][0]).toEqual(2000000n);
  });

  it("sets already-computed script_data_hash/auxiliary_data_hash verbatim", () => {
    const scriptDataHash = "22".repeat(32);
    const auxDataHash = "33".repeat(32);
    const body = transactionBodyPrototypeToCardano({
      ...minimalBody(),
      auxiliary_data_hash: auxDataHash,
      script_data_hash: scriptDataHash,
    });
    expect(body.scriptDataHash()!.toString()).toEqual(scriptDataHash);
    expect(body.auxiliaryDataHash()!.toString()).toEqual(auxDataHash);
  });

  it("sets certs using the given network_id", () => {
    const body = transactionBodyPrototypeToCardano({
      ...minimalBody(),
      certs: [
        {
          type: "STAKE_REGISTRATION",
          value: { stake_credential: { type: "KEY", value: "bb".repeat(28) } },
        },
      ],
      network_id: { type: "TESTNET" },
    });
    expect([...body.certs()!.values()]).toHaveLength(1);
  });

  it("sets required_signers", () => {
    const body = transactionBodyPrototypeToCardano({
      ...minimalBody(),
      required_signers: ["cc".repeat(28)],
    });
    const signers = [...body.requiredSigners()!.values()];
    expect(signers).toHaveLength(1);
    expect(signers[0]!.toCore()).toEqual("cc".repeat(28));
  });
});
