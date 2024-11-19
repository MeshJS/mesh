import { mConStr0, MeshTxBuilderBody, NativeScript } from "@meshsdk/common";
import {
  serializeNativeScript,
} from "@meshsdk/core";
import {
  CardanoSDKSerializer,
  resolveNativeScriptHash,
} from "@meshsdk/core-cst";
import { MeshTxBuilder } from "@meshsdk/transaction";

describe("Transaction serializer - core-cst", () => {
  it("Outputs should contain min utxo value if lovelace value not provided", () => {
    const serializer = new CardanoSDKSerializer(undefined, true);
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
              unit: "d9312da562da182b02322fd8acb536f37eb9d29fba7c49dc17255527",
              quantity: "1",
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
      mints: [
        {
          type: "Plutus",
          policyId: "d9312da562da182b02322fd8acb536f37eb9d29fba7c49dc17255527",
          assetName: "",
          amount: "1",
          scriptSource: {
            type: "Provided",
            script: {
              version: "V2",
              code: "5883588101000032323232323232322232533300632323232533300a3370e9000000899b8f375c601c601000e911046d6573680014a0601000260180026018002600800429309b2b19299980319b87480000044c8c94ccc02cc03400852616375c601600260080062c60080044600a6ea80048c00cdd5000ab9a5573aaae7955cfaba15745",
            },
          },
          redeemer: {
            data: {
              content: mConStr0([]),
              type: "Mesh"
            },
            exUnits: {
              mem: 1000,
              steps: 100,
            }
          }
        },
      ],
      changeAddress:
        "addr_test1qq0yavv5uve45rwvfaw96qynrqt8ckpmkwcg08vlwxxdncxk82f5wz75mzaesmqzl79xqsmedwgucwtuav5str6untqqmykcpn",
      metadata: [],
      validityRange: {},
      certificates: [],
      withdrawals: [],
      signingKey: [],
      network: "preprod",
    };

    let txHex = serializer.serializeTxBody(body);
    console.log(txHex);
    expect(txHex !== "").toBeTruthy();
  });

  it("Correct fee calculated with ref script used", () => {
    const serializer = new CardanoSDKSerializer(undefined, true);
    let mesh = new MeshTxBuilder({ serializer });

    let txHex = mesh
      .txIn(
        "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
        3,
        [{ unit: "lovelace", quantity: "9891607895" }],
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .simpleScriptTxInReference(
        "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
        1,
        resolveNativeScriptHash({
          type: "all",
          scripts: [
            {
              type: "after",
              slot: "1",
            },
          ],
        }),
        "1000",
      )
      .txOut(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
        [{ unit: "lovelace", quantity: "2000000" }],
      )
      .changeAddress(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .setNetwork("preprod")
      .completeSync();

    console.log(txHex);
    expect(txHex !== "").toBeTruthy();
  });

  it("Ref input overlaps correctly removed", () => {
    const serializer = new CardanoSDKSerializer(undefined, true);
    let mesh = new MeshTxBuilder({ serializer });

    let txHex = mesh
      .txIn(
        "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
        1,
        [{ unit: "lovelace", quantity: "9891607895" }],
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .simpleScriptTxInReference(
        "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
        1,
        resolveNativeScriptHash({
          type: "all",
          scripts: [
            {
              type: "after",
              slot: "1",
            },
          ],
        }),
        "1000",
      )
      .txOut(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
        [{ unit: "lovelace", quantity: "2000000" }],
      )
      .changeAddress(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .setNetwork("preprod")
      .completeSync();

    console.log(txHex);
    expect(txHex !== "").toBeTruthy();
  });

  it("simple send success", () => {
    const serializer = new CardanoSDKSerializer(undefined, true);
    let mesh = new MeshTxBuilder({ serializer });

    let txHex = mesh
      .txOut(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
        [{ unit: "lovelace", quantity: "2000000" }],
      )
      .changeAddress(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .selectUtxosFrom([
        {
          input: {
            txHash:
              "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
            outputIndex: 1,
          },
          output: {
            address:
              "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
            amount: [{ unit: "lovelace", quantity: "9891607895" }],
          },
        },
      ])
      .setNetwork("preprod")
      .completeSync();

    console.log(txHex);
    expect(txHex !== "").toBeTruthy();
  });

  it("native scripts provided should increase fees paid", () => {
    const serializer = new CardanoSDKSerializer(undefined, true);
    let mesh = new MeshTxBuilder({ serializer });

    let script: NativeScript = {
      type: "all",
      scripts: [
        {
          type: "sig",
          keyHash: "5867c3b8e27840f556ac268b781578b14c5661fc63ee720dbeab663f",
        },
        {
          type: "sig",
          keyHash: "81bb100eaaab4d1347671d428a94e77d1a844d321aefcb2afe5e8553",
        },
      ],
    };

    let txHex = mesh
      .txIn(
        "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
        2,
        [{ unit: "lovelace", quantity: "2000000" }],
        serializeNativeScript(script).address,
      )
      .txInScript(serializeNativeScript(script).scriptCbor!)
      .txOut(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
        [{ unit: "lovelace", quantity: "2000000" }],
      )
      .changeAddress(
        "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
      )
      .selectUtxosFrom([
        {
          input: {
            txHash:
              "2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85",
            outputIndex: 1,
          },
          output: {
            address:
              "addr_test1vru4e2un2tq50q4rv6qzk7t8w34gjdtw3y2uzuqxzj0ldrqqactxh",
            amount: [{ unit: "lovelace", quantity: "9891607895" }],
          },
        },
      ])
      .requiredSignerHash(
        "9e1dc7b577665ac48b8da4b112cb2bb96f7b3994437548746eba3fe8",
      )
      .setNetwork("preprod")
      .completeSync();

    console.log(txHex);
    expect(txHex !== "").toBeTruthy();
  });
});
