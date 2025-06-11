import { MeshTxBuilderBody } from "@meshsdk/common";
import { MeshTxBuilder } from "@meshsdk/core";
import { OfflineEvaluator } from "@meshsdk/core-csl";
import { Transaction, TxCBOR } from "@meshsdk/core-cst";
import { OfflineFetcher } from "@meshsdk/provider";

describe("MeshTxBuilder - Fee Calculation", () => {
  it("test", async () => {
    const txBody: Partial<MeshTxBuilderBody> = {
      inputs: [
        {
          type: "PubKey",
          txIn: {
            txHash:
              "0096c16477fd2ac40a564b6baacb00008594b91f250f4a4e715c4ac180a77cba",
            txIndex: 2,
            amount: [{ unit: "lovelace", quantity: "5000000" }],
            address:
              "addr_test1qqgetxt6xhz08u9s68km9scj8gjcjlvczrs9ghu4p3s6u8cc0f73w6hkrjxhqhsarjq750fzj4cdv86xjrnr3fw6ljnqwsw386",
            scriptSize: 0,
          },
        },
      ],
      outputs: [],
      collaterals: [
        {
          type: "PubKey",
          txIn: {
            txHash:
              "c4337fbc0f23166333b39cc9f74e8d94d184e1ae8b382e13c2995356e5d135e1",
            txIndex: 2,
            amount: [{ unit: "lovelace", quantity: "20327085" }],
            address:
              "addr_test1qqx6up6v43yzy2qqmfjyjudrtd5gx24mgzmpjep7lhnhmjwm3mzcl8azjuynu2r0s8fhh6n32ssfqey4vf2dt48zzzxs7csy54",
          },
        },
      ],
      requiredSignatures: [],
      referenceInputs: [],
      mints: [
        {
          type: "Plutus",
          policyId: "81eb1152ba85cf000a49a7c5290ac484e3a1d3c5eb4fe7a158367039",
          scriptSource: {
            type: "Provided",
            script: {
              code: "5902bc5902b90101003323232323232323232323222598009919191919299919805980098069baa0021325980080244c8c8c966002600a00315980098091baa00780140350134566002600600315980098091baa0078014035013403500f201e3010375400c264b3001001806c4c966002602c0051323259800980398099baa0098acc00566002646600200200444b30010018a50899912cc004cdd7980d980c1baa0020128a51899802002000a02a3019001301a001405d14a315330124911a69735f6f75747075745f636f6e73756d6564203f2046616c73650014a0808a2600a00514a0808a266e1c009200140446eb0c058c04cdd50049bad301200180720263014001404864b300130023010375400314bd6f7b63044dd5980a18089baa001403864660020026eacc050c054c054c054c054c044dd5003912cc004006298103d87a80008994c004dd71809000cdd59809800cc05c0092225980099b910080038acc004cdc7804001c4cdd2a4000660306e980092f5c114c0103d87a8000404d133006006001404c3015001404c6e1d2002805402a01500a40506eb8c044c038dd50011b874800058c03cc04000cc038008c034008c034004c020dd5000c5268a9980324811856616c696461746f722072657475726e65642066616c7365001365640142a6600692011672656465656d65723a204d696e74506f6c61726974790016153300249175657870656374205b50616972285f61737365745f6e616d652c207175616e74697479295d203d0a20202020202073656c662e6d696e740a20202020202020207c3e206173736574732e746f6b656e7328706f6c6963795f6964290a20202020202020207c3e20646963742e746f5f7061697273282900165734ae7155ceaab9e5573eae815d0aba2574898127d8799f58200096c16477fd2ac40a564b6baacb00008594b91f250f4a4e715c4ac180a77cba02ff0001",
              version: "V3",
            },
          },
          redeemer: {
            data: { type: "JSON", content: '{"constructor":0,"fields":[]}' },
            exUnits: { mem: 61305, steps: 20462269 },
          },
          mintValue: [{ assetName: "", amount: "1" }],
        },
      ],
      changeAddress:
        "addr_test1qqgetxt6xhz08u9s68km9scj8gjcjlvczrs9ghu4p3s6u8cc0f73w6hkrjxhqhsarjq750fzj4cdv86xjrnr3fw6ljnqwsw386",
      metadata: new Map(),
      validityRange: {},
      certificates: [],
      withdrawals: [],
      votes: [],
      signingKey: [],
      chainedTxs: [],
      inputsForEvaluation: {},
      network: "preprod",
      expectedNumberKeyWitnesses: 0,
      expectedByronAddressWitnesses: [],
      extraInputs: [
        {
          input: {
            outputIndex: 2,
            txHash:
              "0096c16477fd2ac40a564b6baacb00008594b91f250f4a4e715c4ac180a77cba",
          },
          output: {
            address:
              "addr_test1qqgetxt6xhz08u9s68km9scj8gjcjlvczrs9ghu4p3s6u8cc0f73w6hkrjxhqhsarjq750fzj4cdv86xjrnr3fw6ljnqwsw386",
            amount: [
              {
                unit: "lovelace",
                quantity: "5000000",
              },
            ],
          },
        },
        {
          input: {
            outputIndex: 1,
            txHash:
              "1f935fa8269127b6fe46a3bd5c88f0fb1f6dc7fe66abde1498e922b1390b8c4f",
          },
          output: {
            address:
              "addr_test1qqgetxt6xhz08u9s68km9scj8gjcjlvczrs9ghu4p3s6u8cc0f73w6hkrjxhqhsarjq750fzj4cdv86xjrnr3fw6ljnqwsw386",
            amount: [
              {
                unit: "lovelace",
                quantity: "3959213839",
              },
            ],
          },
        },
        {
          input: {
            outputIndex: 2,
            txHash:
              "1f935fa8269127b6fe46a3bd5c88f0fb1f6dc7fe66abde1498e922b1390b8c4f",
          },
          output: {
            address:
              "addr_test1qqgetxt6xhz08u9s68km9scj8gjcjlvczrs9ghu4p3s6u8cc0f73w6hkrjxhqhsarjq750fzj4cdv86xjrnr3fw6ljnqwsw386",
            amount: [
              {
                unit: "lovelace",
                quantity: "1979696270",
              },
            ],
          },
        },
        {
          input: {
            outputIndex: 3,
            txHash:
              "1f935fa8269127b6fe46a3bd5c88f0fb1f6dc7fe66abde1498e922b1390b8c4f",
          },
          output: {
            address:
              "addr_test1qqgetxt6xhz08u9s68km9scj8gjcjlvczrs9ghu4p3s6u8cc0f73w6hkrjxhqhsarjq750fzj4cdv86xjrnr3fw6ljnqwsw386",
            amount: [
              {
                unit: "lovelace",
                quantity: "989848136",
              },
            ],
          },
        },
        {
          input: {
            outputIndex: 4,
            txHash:
              "1f935fa8269127b6fe46a3bd5c88f0fb1f6dc7fe66abde1498e922b1390b8c4f",
          },
          output: {
            address:
              "addr_test1qqgetxt6xhz08u9s68km9scj8gjcjlvczrs9ghu4p3s6u8cc0f73w6hkrjxhqhsarjq750fzj4cdv86xjrnr3fw6ljnqwsw386",
            amount: [
              {
                unit: "lovelace",
                quantity: "989848135",
              },
            ],
          },
        },
        {
          input: {
            outputIndex: 3,
            txHash:
              "840807686aca1086d3d9a68aae9007bbd2cc80f711e58003fdad26ccd251bcef",
          },
          output: {
            address:
              "addr_test1qqgetxt6xhz08u9s68km9scj8gjcjlvczrs9ghu4p3s6u8cc0f73w6hkrjxhqhsarjq750fzj4cdv86xjrnr3fw6ljnqwsw386",
            amount: [
              {
                unit: "lovelace",
                quantity: "771634795",
              },
              {
                unit: "1c24687602c866101d41aa64e39685ee7092f26af15c5329104141fd6d657368",
                quantity: "1",
              },
            ],
          },
        },
      ],
      selectionConfig: {
        threshold: "",
        strategy: "largestFirst",
        includeTxFees: false,
      },
    };

    const txBuilder = new MeshTxBuilder();
    const txHex = await txBuilder.complete(txBody);
    const cardanoTx = Transaction.fromCbor(TxCBOR(txHex));
    expect(cardanoTx.body().fee()).toBeGreaterThanOrEqual(214734n);
  });
});
