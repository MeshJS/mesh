import { MeshTxBuilderBody } from "@meshsdk/common";
import { CardanoSDKSerializer, Transaction, TxCBOR } from "@meshsdk/core-cst";

describe("Sanitize outputs", () => {
  it("serializer should sanitize outputs", () => {
    const serializer = new CardanoSDKSerializer();
    const body: MeshTxBuilderBody = {
      inputs: [
        {
          type: "PubKey",
          txIn: {
            txHash:
              "dcd976452c9e7217070736ce734588327193546d517ef2b9ecea6f42f123913c",
            txIndex: 0,
            amount: [{ unit: "lovelace", quantity: "3000000" }],
            address:
              "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
            scriptSize: 0,
          },
        },
      ],
      outputs: [
        {
          address:
            "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
          amount: [],
        },
      ],
      extraInputs: [],
      collaterals: [],
      requiredSignatures: [],
      referenceInputs: [],
      mints: [],
      changeAddress:
        "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9",
      metadata: new Map(),
      validityRange: {},
      certificates: [],
      withdrawals: [],
      votes: [],
      signingKey: [],
      selectionConfig: {
        threshold: "0",
        strategy: "experimental",
        includeTxFees: true,
      },
      chainedTxs: [],
      inputsForEvaluation: {},
      expectedNumberKeyWitnesses: 0,
      expectedByronAddressWitnesses: [],
      fee: "1000000",
      network: "mainnet",
    };

    const txHex = serializer.serializeTxBody(body);
    const cardanoTx = Transaction.fromCbor(TxCBOR(txHex));
    expect(cardanoTx.body().outputs()[0]!.amount().coin()).toBeGreaterThan(
      BigInt(0),
    );
  });
});
