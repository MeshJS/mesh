import { Protocol } from "@meshsdk/common";

import { CardanoSDKSerializer } from "../../src";

describe("Build transaction with custom protocol params", () => {
  const HYDRA_PROTOCOL_PARAMETER: Protocol = {
    epoch: 0,
    coinsPerUtxoSize: 0, // changed
    priceMem: 0.0, // changed
    priceStep: 0.0, // changed
    minFeeA: 0, // changed
    minFeeB: 0, // changed
    keyDeposit: 0, // changed
    // maxTxSize: 16_384_000, // changed
    // maxTxSize: 16_384_000_000, // changed
    maxTxSize: 4_294_967_295, // changed
    maxValSize: 5000,
    poolDeposit: 0,
    maxCollateralInputs: 3,
    decentralisation: 0,
    // maxBlockSize: 98304,
    maxBlockSize: 98_304_000, // changed
    collateralPercent: 150,
    maxBlockHeaderSize: 1100,
    minPoolCost: "170000000",
    // maxTxExMem: "16000000",
    // maxTxExSteps: "10000000000",
    // maxBlockExMem: "80000000",
    // maxBlockExSteps: "40000000000",
    maxTxExMem: "16000000000", // changed
    maxTxExSteps: "10000000000000", // changed
    maxBlockExMem: "80000000000", // changed
    maxBlockExSteps: "40000000000000", // changed
    minFeeRefScriptCostPerByte: 0,
  };

  it("should build transaction with custom protocol params", async () => {
    const serializer = new CardanoSDKSerializer(HYDRA_PROTOCOL_PARAMETER);

    expect(
      serializer.serializeTxBody({
        inputs: [
          {
            type: "Script",
            txIn: {
              txHash:
                "1cc0f3ad84b39e4129f603a27401ddd21056cb9eaf58580856ce6ff3aed8acc1",
              txIndex: 2,
              amount: [
                { unit: "lovelace", quantity: "1500000" },
                {
                  unit: "bdeb17d07ea41c2ccaa923fc9a97f1036f09d77f062ae7932f838d9e",
                  quantity: "1",
                },
              ],
              address:
                "addr_test1wrh7mlyk9s540ue3puvax3qrg4spvsceel7fz6d3g2cvg3sh9pzy3",
              scriptSize: 0,
            },
            scriptTxIn: {
              datumSource: {
                type: "Inline",
                txHash:
                  "1cc0f3ad84b39e4129f603a27401ddd21056cb9eaf58580856ce6ff3aed8acc1",
                txIndex: 2,
              },
              scriptSource: {
                type: "Provided",
                script: {
                  code: "58b258b0010100333232323232232225333005323232323232330010013758601c601e601e601e601e601e601e601e601e60186ea8c038c030dd50039129998070008a50132533300d3371e6eb8c04000802c52889980180180098080009806180680118058009805801180480098031baa00114984d958dd7000ab9a5573caae7d5d0aba24c011e581cfa5136e9e9ecbc9071da73eeb6c9a4ff73cbf436105cf8380d1c525c004c010847362d7370656e640001",
                  version: "V3",
                },
              },
              redeemer: {
                data: { type: "Mesh", content: { alternative: 2, fields: [] } },
                exUnits: { mem: 7000000, steps: 3000000000 },
              },
            },
          },
          {
            type: "Script",
            txIn: {
              txHash:
                "4a2a457b509705ef85df589799f6ae1eabe2a444915aefeefb1a90b481328774",
              txIndex: 1,
              amount: [
                { unit: "lovelace", quantity: "1500000" },
                {
                  unit: "57dd033da7865978bd4224234c58f38d387e78f3abcfac760dbea6e4",
                  quantity: "1",
                },
              ],
              address:
                "addr_test1wpau6rysxjgkf4qj8rsyr334ty35sr4pn6zrn2cz2ne63yqeptp8a",
              scriptSize: 0,
            },
            scriptTxIn: {
              datumSource: {
                type: "Inline",
                txHash:
                  "4a2a457b509705ef85df589799f6ae1eabe2a444915aefeefb1a90b481328774",
                txIndex: 1,
              },
              scriptSource: {
                type: "Provided",
                script: {
                  code: "58b258b0010100333232323232232225333005323232323232330010013758601c601e601e601e601e601e601e601e601e60186ea8c038c030dd50039129998070008a50132533300d3371e6eb8c04000802c52889980180180098080009806180680118058009805801180480098031baa00114984d958dd7000ab9a5573caae7d5d0aba24c011e581cfa5136e9e9ecbc9071da73eeb6c9a4ff73cbf436105cf8380d1c525c004c010847352d7370656e640001",
                  version: "V3",
                },
              },
              redeemer: {
                data: { type: "Mesh", content: { alternative: 4, fields: [] } },
                exUnits: { mem: 7000000, steps: 3000000000 },
              },
            },
          },
        ],
        outputs: [
          {
            address:
              "addr_test1wrh7mlyk9s540ue3puvax3qrg4spvsceel7fz6d3g2cvg3sh9pzy3",
            amount: [
              { unit: "lovelace", quantity: "1500000" },
              {
                unit: "bdeb17d07ea41c2ccaa923fc9a97f1036f09d77f062ae7932f838d9e",
                quantity: "1",
              },
            ],
            datum: {
              type: "Inline",
              data: {
                type: "JSON",
                content:
                  '{"constructor":0,"fields":[{"bytes":"0000000000000000000000000000000000000000000000000000000000000000"}]}',
              },
            },
          },
          {
            address:
              "addr_test1wpau6rysxjgkf4qj8rsyr334ty35sr4pn6zrn2cz2ne63yqeptp8a",
            amount: [
              { unit: "lovelace", quantity: "1500000" },
              {
                unit: "57dd033da7865978bd4224234c58f38d387e78f3abcfac760dbea6e4",
                quantity: "1",
              },
            ],
            datum: {
              type: "Inline",
              data: {
                type: "JSON",
                content:
                  '{"constructor":0,"fields":[{"bytes":"0000000000000000000000000000000000000000000000000000000000000000"}]}',
              },
            },
          },
          {
            address:
              "addr_test1wz0a74329m3tdc5dgkxpatzc7vkxwjtp4rlg2h47ngyfp9qpqyzes",
            amount: [
              {
                unit: "3ef107f3846191c353d00a7a6c7320771d11703593d7506d5bad85fc",
                quantity: "1",
              },
            ],
            datum: {
              type: "Inline",
              data: {
                type: "JSON",
                content:
                  '{"constructor":0,"fields":[{"bytes":"fdeb4bf0e8c077114a4553f1e05395e9fb7114db177f02f7b65c8de4"},{"map":[{"k":{"bytes":""},"v":{"map":[{"k":{"bytes":""},"v":{"int":1000000000}}]}},{"k":{"bytes":"5066154a102ee037390c5236f78db23239b49c5748d3d349f3ccf04b"},"v":{"map":[{"k":{"bytes":"55534458"},"v":{"int":1000000000}}]}}]}]}',
              },
            },
          },
          {
            address:
              "addr_test1wz0a74329m3tdc5dgkxpatzc7vkxwjtp4rlg2h47ngyfp9qpqyzes",
            amount: [
              {
                unit: "3ef107f3846191c353d00a7a6c7320771d11703593d7506d5bad85fc",
                quantity: "1",
              },
            ],
            datum: {
              type: "Inline",
              data: {
                type: "JSON",
                content:
                  '{"constructor":0,"fields":[{"bytes":"04845038ee499ee8bc0afe56f688f27b2dd76f230d3698a9afcc1b66"},{"map":[{"k":{"bytes":""},"v":{"map":[{"k":{"bytes":""},"v":{"int":20000000}}]}},{"k":{"bytes":"5066154a102ee037390c5236f78db23239b49c5748d3d349f3ccf04b"},"v":{"map":[{"k":{"bytes":"55534458"},"v":{"int":20000000}}]}}]}]}',
              },
            },
          },
          {
            address:
              "addr_test1wz0a74329m3tdc5dgkxpatzc7vkxwjtp4rlg2h47ngyfp9qpqyzes",
            amount: [
              {
                unit: "3ef107f3846191c353d00a7a6c7320771d11703593d7506d5bad85fc",
                quantity: "1",
              },
            ],
            datum: {
              type: "Inline",
              data: {
                type: "JSON",
                content:
                  '{"constructor":0,"fields":[{"bytes":"4ba6dd244255995969d2c05e323686bcbaba83b736e729941825d79b"},{"map":[{"k":{"bytes":""},"v":{"map":[{"k":{"bytes":""},"v":{"int":1000000000}}]}},{"k":{"bytes":"5066154a102ee037390c5236f78db23239b49c5748d3d349f3ccf04b"},"v":{"map":[{"k":{"bytes":"55534458"},"v":{"int":1000000000}}]}}]}]}',
              },
            },
          },
          {
            address:
              "addr_test1wz0a74329m3tdc5dgkxpatzc7vkxwjtp4rlg2h47ngyfp9qpqyzes",
            amount: [
              {
                unit: "3ef107f3846191c353d00a7a6c7320771d11703593d7506d5bad85fc",
                quantity: "1",
              },
            ],
            datum: {
              type: "Inline",
              data: {
                type: "JSON",
                content:
                  '{"constructor":0,"fields":[{"bytes":"e7b187b596e794b5650a1ff96d02cbb6d5cac6593c59a63d66956e5f"},{"map":[{"k":{"bytes":""},"v":{"map":[{"k":{"bytes":""},"v":{"int":1000000000}}]}},{"k":{"bytes":"5066154a102ee037390c5236f78db23239b49c5748d3d349f3ccf04b"},"v":{"map":[{"k":{"bytes":"55534458"},"v":{"int":1000000000}}]}}]}]}',
              },
            },
          },
        ],
        collaterals: [
          {
            type: "PubKey",
            txIn: {
              txHash:
                "891f949b81c78535c9d5b50da2461357dd3b057006547c7da6131af5fa755f46",
              txIndex: 100,
              amount: [{ unit: "lovelace", quantity: "10000000" }],
              address:
                "addr_test1vra9zdhfa8kteyr3mfe7adkf5nlh8jl5xcg9e7pcp5w9yhq5exvwh",
              scriptSize: 0,
            },
          },
        ],
        requiredSignatures: [
          "fa5136e9e9ecbc9071da73eeb6c9a4ff73cbf436105cf8380d1c525c",
        ],
        referenceInputs: [],
        mints: [
          {
            type: "Plutus",
            policyId:
              "3ef107f3846191c353d00a7a6c7320771d11703593d7506d5bad85fc",
            mintValue: [{ assetName: "", amount: "4" }],
            redeemer: {
              data: { type: "Mesh", content: { alternative: 0, fields: [] } },
              exUnits: { mem: 7000000, steps: 3000000000 },
            },
            scriptSource: {
              type: "Provided",
              script: {
                code: "58b158af010100333232323232232225333005323232323232330010013758601c601e601e601e601e601e601e601e601e60186ea8c038c030dd50039129998070008a50132533300d3371e6eb8c04000802c52889980180180098080009806180680118058009805801180480098031baa00114984d958dd7000ab9a5573caae7d5d0aba24c011e581cfa5136e9e9ecbc9071da73eeb6c9a4ff73cbf436105cf8380d1c525c004c010746392d6d696e740001",
                version: "V3",
              },
            },
          },
        ],
        changeAddress:
          "addr_test1qra9zdhfa8kteyr3mfe7adkf5nlh8jl5xcg9e7pcp5w9yhyf5tek6vpnha97yd5yw9pezm3wyd77fyrfs3ynftyg7njs5cfz2x",
        metadata: new Map(),
        validityRange: {},
        certificates: [],
        withdrawals: [],
        votes: [],
        signingKey: [],
        network: [
          [
            100788, 420, 1, 1, 1000, 173, 0, 1, 1000, 59957, 4, 1, 11183, 32,
            201305, 8356, 4, 16000, 100, 16000, 100, 16000, 100, 16000, 100,
            16000, 100, 16000, 100, 100, 100, 16000, 100, 94375, 32, 132994, 32,
            61462, 4, 72010, 178, 0, 1, 22151, 32, 91189, 769, 4, 2, 85848,
            228465, 122, 0, 1, 1, 1000, 42921, 4, 2, 24548, 29498, 38, 1,
            898148, 27279, 1, 51775, 558, 1, 39184, 1000, 60594, 1, 141895, 32,
            83150, 32, 15299, 32, 76049, 1, 13169, 4, 22100, 10, 28999, 74, 1,
            28999, 74, 1, 43285, 552, 1, 44749, 541, 1, 33852, 32, 68246, 32,
            72362, 32, 7243, 32, 7391, 32, 11546, 32, 85848, 228465, 122, 0, 1,
            1, 90434, 519, 0, 1, 74433, 32, 85848, 228465, 122, 0, 1, 1, 85848,
            228465, 122, 0, 1, 1, 270652, 22588, 4, 1457325, 64566, 4, 20467, 1,
            4, 0, 141992, 32, 100788, 420, 1, 1, 81663, 32, 59498, 32, 20142,
            32, 24588, 32, 20744, 32, 25933, 32, 24623, 32, 53384111, 14333, 10,
          ],
          [
            100788, 420, 1, 1, 1000, 173, 0, 1, 1000, 59957, 4, 1, 11183, 32,
            201305, 8356, 4, 16000, 100, 16000, 100, 16000, 100, 16000, 100,
            16000, 100, 16000, 100, 100, 100, 16000, 100, 94375, 32, 132994, 32,
            61462, 4, 72010, 178, 0, 1, 22151, 32, 91189, 769, 4, 2, 85848,
            228465, 122, 0, 1, 1, 1000, 42921, 4, 2, 24548, 29498, 38, 1,
            898148, 27279, 1, 51775, 558, 1, 39184, 1000, 60594, 1, 141895, 32,
            83150, 32, 15299, 32, 76049, 1, 13169, 4, 22100, 10, 28999, 74, 1,
            28999, 74, 1, 43285, 552, 1, 44749, 541, 1, 33852, 32, 68246, 32,
            72362, 32, 7243, 32, 7391, 32, 11546, 32, 85848, 228465, 122, 0, 1,
            1, 90434, 519, 0, 1, 74433, 32, 85848, 228465, 122, 0, 1, 1, 85848,
            228465, 122, 0, 1, 1, 955506, 213312, 0, 2, 270652, 22588, 4,
            1457325, 64566, 4, 20467, 1, 4, 0, 141992, 32, 100788, 420, 1, 1,
            81663, 32, 59498, 32, 20142, 32, 24588, 32, 20744, 32, 25933, 32,
            24623, 32, 43053543, 10, 53384111, 14333, 10, 43574283, 26308, 10,
          ],
          [
            100788, 420, 1, 1, 1000, 173, 0, 1, 1000, 59957, 4, 1, 11183, 32,
            201305, 8356, 4, 16000, 100, 16000, 100, 16000, 100, 16000, 100,
            16000, 100, 16000, 100, 100, 100, 16000, 100, 94375, 32, 132994, 32,
            61462, 4, 72010, 178, 0, 1, 22151, 32, 91189, 769, 4, 2, 85848,
            123203, 7305, -900, 1716, 549, 57, 85848, 0, 1, 1, 1000, 42921, 4,
            2, 24548, 29498, 38, 1, 898148, 27279, 1, 51775, 558, 1, 39184,
            1000, 60594, 1, 141895, 32, 83150, 32, 15299, 32, 76049, 1, 13169,
            4, 22100, 10, 28999, 74, 1, 28999, 74, 1, 43285, 552, 1, 44749, 541,
            1, 33852, 32, 68246, 32, 72362, 32, 7243, 32, 7391, 32, 11546, 32,
            85848, 123203, 7305, -900, 1716, 549, 57, 85848, 0, 1, 90434, 519,
            0, 1, 74433, 32, 85848, 123203, 7305, -900, 1716, 549, 57, 85848, 0,
            1, 1, 85848, 123203, 7305, -900, 1716, 549, 57, 85848, 0, 1, 955506,
            213312, 0, 2, 270652, 22588, 4, 1457325, 64566, 4, 20467, 1, 4, 0,
            141992, 32, 100788, 420, 1, 1, 81663, 32, 59498, 32, 20142, 32,
            24588, 32, 20744, 32, 25933, 32, 24623, 32, 43053543, 10, 53384111,
            14333, 10, 43574283, 26308, 10, 16000, 100, 16000, 100, 962335, 18,
            2780678, 6, 442008, 1, 52538055, 3756, 18, 267929, 18, 76433006,
            8868, 18, 52948122, 18, 1995836, 36, 3227919, 12, 901022, 1,
            166917843, 4307, 36, 284546, 36, 158221314, 26549, 36, 74698472, 36,
            333849714, 1, 254006273, 72, 2174038, 72, 2261318, 64571, 4, 207616,
            8310, 4, 1293828, 28716, 63, 0, 1, 1006041, 43623, 251, 0, 1,
            100181, 726, 719, 0, 1, 100181, 726, 719, 0, 1, 100181, 726, 719, 0,
            1, 107878, 680, 0, 1, 95336, 1, 281145, 18848, 0, 1, 180194, 159, 1,
            1, 158519, 8942, 0, 1, 159378, 8813, 0, 1, 107490, 3298, 1, 106057,
            655, 1, 1964219, 24520, 3,
          ],
        ],
        extraInputs: [],
        selectionConfig: {
          threshold: "",
          strategy: "largestFirst",
          includeTxFees: false,
        },
        chainedTxs: [],
        inputsForEvaluation: {},
        fee: "0",
        expectedNumberKeyWitnesses: 0,
        expectedByronAddressWitnesses: [],
      }),
    ).toBeTruthy();
  });
});
