import {
  DEFAULT_PROTOCOL_PARAMETERS,
  MeshTxBuilderBody,
} from "@meshsdk/common";
import { CSLSerializer } from "@meshsdk/core-csl";

describe("Builder", () => {
  test("serializeTxBody - send lovelace", () => {
    const serializer = new CSLSerializer();
    const body: MeshTxBuilderBody = {
      inputs: [
        {
          type: "PubKey",
          txIn: {
            txHash:
              "1662c4b349907e4d92e0995fd9dcdc9a4489f7dff4f5cce6b4b3901de479308c",
            txIndex: 14,
            amount: [
              {
                unit: "lovelace",
                quantity: "774643176",
              },
            ],
            address:
              "addr_test1qq0yavv5uve45rwvfaw96qynrqt8ckpmkwcg08vlwxxdncxk82f5wz75mzaesmqzl79xqsmedwgucwtuav5str6untqqmykcpn",
          },
        },
      ],
      outputs: [
        {
          address:
            "addr_test1qq0yavv5uve45rwvfaw96qynrqt8ckpmkwcg08vlwxxdncxk82f5wz75mzaesmqzl79xqsmedwgucwtuav5str6untqqmykcpn",
          amount: [
            {
              unit: "lovelace",
              quantity: "1231231",
            },
          ],
        },
      ],
      extraInputs: [
        {
          input: {
            outputIndex: 14,
            txHash:
              "1662c4b349907e4d92e0995fd9dcdc9a4489f7dff4f5cce6b4b3901de479308c",
          },
          output: {
            address:
              "addr_test1qq0yavv5uve45rwvfaw96qynrqt8ckpmkwcg08vlwxxdncxk82f5wz75mzaesmqzl79xqsmedwgucwtuav5str6untqqmykcpn",
            amount: [
              {
                unit: "lovelace",
                quantity: "774643176",
              },
            ],
          },
        },
        {
          input: {
            outputIndex: 54,
            txHash:
              "43cdd76f2b74d31e56813276b695b64fe91daac195ac37ac3b4a4b44b405f3bf",
          },
          output: {
            address:
              "addr_test1qq0yavv5uve45rwvfaw96qynrqt8ckpmkwcg08vlwxxdncxk82f5wz75mzaesmqzl79xqsmedwgucwtuav5str6untqqmykcpn",
            amount: [
              {
                unit: "lovelace",
                quantity: "390216112",
              },
            ],
          },
        },
      ],
      selectionConfig: {
        threshold: "5000000",
        strategy: "experimental",
        includeTxFees: true,
      },
      collaterals: [],
      requiredSignatures: [],
      referenceInputs: [],
      mints: [],
      changeAddress:
        "addr_test1qq0yavv5uve45rwvfaw96qynrqt8ckpmkwcg08vlwxxdncxk82f5wz75mzaesmqzl79xqsmedwgucwtuav5str6untqqmykcpn",
      metadata: [],
      validityRange: {},
      certificates: [],
      withdrawals: [],
      signingKey: [],
      network: "preprod",
      votes: [],
    };
    const txHex = serializer.serializeTxBody(body, DEFAULT_PROTOCOL_PARAMETERS);
    expect(txHex).toEqual(
      "84a300d90102818258201662c4b349907e4d92e0995fd9dcdc9a4489f7dff4f5cce6b4b3901de479308c0e0182825839001e4eb194e3335a0dcc4f5c5d009318167c583bb3b0879d9f718cd9e0d63a93470bd4d8bb986c02ff8a6043796b91cc397ceb29058f5c9ac01a0012c97f825839001e4eb194e3335a0dcc4f5c5d009318167c583bb3b0879d9f718cd9e0d63a93470bd4d8bb986c02ff8a6043796b91cc397ceb29058f5c9ac01a2e16c2ec021a0002917da0f5f6",
    );
  });
});
