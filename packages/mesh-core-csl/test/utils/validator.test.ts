import { validateTx, ValidationInputContext } from "../../src/utils/validator";

describe("Validate tx", () => {
  test("basic validate tx", async () => {
    const validationContext: ValidationInputContext = {
      accountContexts: [],
      currentCommitteeMembers: [],
      drepContexts: [],
      govActionContexts: [
        {
          actionId: {
            txHash:
              "95b2b05ae3e09a19a00673524f8ff4426839e2410fd2565a52a49952d48a6b39",
            index: 0n,
          },
          actionType: "treasuryWithdrawalsAction",
          isActive: true,
        },
      ],
      lastEnactedGovAction: [],
      networkType: "preprod",
      poolContexts: [],
      potentialCommitteeMembers: [],
      protocolParameters: {
        adaPerUtxoByte: 4310n,
        collateralPercentage: 150,
        costModels: {
          plutusV1: [
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
          plutusV2: [
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
          plutusV3: [
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
        },
        drepDeposit: 500000000n,
        executionPrices: {
          memPrice: { denominator: 10000n, numerator: 577n },
          stepPrice: { denominator: 10000000n, numerator: 721n },
        },
        governanceActionDeposit: 100000000000n,
        maxBlockBodySize: 98304,
        maxBlockExecutionUnits: { mem: 80000000, steps: 40000000000 },
        maxBlockHeaderSize: 1100,
        maxCollateralInputs: 3,
        maxEpochForPoolRetirement: 18,
        maxTransactionSize: 16384,
        maxTxExecutionUnits: { mem: 16000000, steps: 10000000000 },
        maxValueSize: 5000,
        minFeeCoefficientA: 44n,
        minFeeConstantB: 155381n,
        minPoolCost: 170000000n,
        protocolVersion: [10, 0],
        referenceScriptCostPerByte: { denominator: 1n, numerator: 15n },
        stakeKeyDeposit: 2000000n,
        stakePoolDeposit: 500000000n,
      },
      slot: 41023545n,
      treasuryValue: 0n,
      utxoSet: [
        {
          isSpent: false,
          utxo: {
            input: {
              outputIndex: 0,
              txHash:
                "604943e070ffbf81cc09bb2942029f5f5361108a3c0b96a7309e6aa70370ad98",
            },
            output: {
              address:
                "addr_test1wzlwsgq97vchypqzk8u8lz30w932tvx7akcj7csm02scl7qlghd97",
              amount: [{ quantity: "986990", unit: "lovelace" }],
              plutusData: "d87980",
            },
          },
        },
        {
          isSpent: false,
          utxo: {
            input: {
              outputIndex: 1,
              txHash:
                "604943e070ffbf81cc09bb2942029f5f5361108a3c0b96a7309e6aa70370ad98",
            },
            output: {
              address:
                "addr_test1vq0atw43vuecjuwe9dxc7z7l2lvgnyp7d6f5ul4r3376mug8v67h5",
              amount: [{ quantity: "9974857893", unit: "lovelace" }],
            },
          },
        },
        {
          isSpent: false,
          utxo: {
            input: {
              outputIndex: 0,
              txHash:
                "04b9070a30bd63abaaf59a3c48a1575c4127bb0edb00ecd5141fd18a85c721aa",
            },
            output: {
              address:
                "addr_test1wzlwsgq97vchypqzk8u8lz30w932tvx7akcj7csm02scl7qlghd97",
              amount: [{ quantity: "986990", unit: "lovelace" }],
              scriptRef: "82025655010000322223253330054a229309b2b1bad0025735",
            },
          },
        },
      ],
    };
    const result = validateTx(
      "84a80082825820604943e070ffbf81cc09bb2942029f5f5361108a3c0b96a7309e6aa70370ad9800825820604943e070ffbf81cc09bb2942029f5f5361108a3c0b96a7309e6aa70370ad98010d81825820604943e070ffbf81cc09bb2942029f5f5361108a3c0b96a7309e6aa70370ad9801128182582004b9070a30bd63abaaf59a3c48a1575c4127bb0edb00ecd5141fd18a85c721aa000181a200581d601fd5bab167338971d92b4d8f0bdf57d889903e6e934e7ea38c7dadf1011b00000002529898c810a200581d601fd5bab167338971d92b4d8f0bdf57d889903e6e934e7ea38c7dadf1011b0000000252882db4111a000412f1021a0002b74b0b5820775d0cf3c95993f6210e4410e92f72ebc3942ce9c1433694749aa239e5d13387a200818258201557f444f3ae6e61dfed593ae15ec8dbd57b8138972bf16fde5b4c559f41549b5840729f1f14ef05b7cf9b0d7583e6777674f80ae64a35bbd6820cc3c82ddf0412ca1d751b7d886eece3c6e219e1c5cc9ef3d387a8d2078f47125d54b474fbdfbd0105818400000182190b111a000b5e35f5f6",
      validationContext,
    );
    expect(result).toBe(
      JSON.stringify({
        errors: [
          {
            error: {
              ScriptDataHashMismatch: {
                expected_hash:
                  "47cacd3013e7747ebb32cd43816b782eeeff9c02ad2de103b496fa11291ce1c9",
                provided_hash:
                  "775d0cf3c95993f6210e4410e92f72ebc3942ce9c1433694749aa239e5d13387",
              },
            },
            error_message:
              "Script data hash mismatch. Expected: 47cacd3013e7747ebb32cd43816b782eeeff9c02ad2de103b496fa11291ce1c9, Found: 775d0cf3c95993f6210e4410e92f72ebc3942ce9c1433694749aa239e5d13387",
            locations: ["transaction.body.script_data_hash"],
            hint: "Ensure the script data hash matches the actual hash of the redeemers and datums. Recalculate the hash if necessary.",
          },
        ],
        warnings: [],
        phase2_errors: [],
        phase2_warnings: [
          {
            warning: {
              BudgetIsBiggerThanExpected: {
                expected_budget: { mem: 2833, steps: 528893 },
                actual_budget: { mem: 2833, steps: 745013 },
              },
            },
            locations: [
              "transaction.body.inputs.0",
              "transaction.witness_set.redeemers.0",
            ],
            hint: null,
          },
        ],
        eval_redeemer_results: [
          {
            tag: "Spend",
            index: 0,
            provided_ex_units: { mem: 2833, steps: 745013 },
            calculated_ex_units: { mem: 2833, steps: 528893 },
            logs: [],
            success: true,
            error: null,
          },
        ],
      }),
    );
  });
});
