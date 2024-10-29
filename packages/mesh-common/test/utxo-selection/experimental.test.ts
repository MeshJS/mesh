import { experimentalSelectUtxos } from "@meshsdk/common";

describe("Experimental Utxo selection", () => {
  describe("experimentalSelectUtxos", () => {
    test("experimentalSelectUtxos", () => {
      const utxos = [
        {
          input: {
            outputIndex: 56,
            txHash:
              "5357731ff8aaacadb4834c87ab5048d1205ede5c9dbd6e24ebd1023713d54a28",
          },
          output: {
            address:
              "addr_test1qqzgg5pcaeyea69uptl9da5g7fajm4m0yvxndx9f4lxpkehqgezy0s04rtdwlc0tlvxafpdrfxnsg7ww68ge3j7l0lnszsw2wt",
            amount: [
              {
                unit: "lovelace",
                quantity: "4135865608",
              },
              {
                unit: "5066154a102ee037390c5236f78db23239b49c5748d3d349f3ccf04b55534458",
                quantity: "8000000000",
              },
            ],
          },
        },
        {
          input: {
            outputIndex: 4,
            txHash:
              "24b018ae80021a3bcedcf46cb9ac9979ed51906a5be37597a2f7923db20139c2",
          },
          output: {
            address:
              "addr_test1qqzgg5pcaeyea69uptl9da5g7fajm4m0yvxndx9f4lxpkehqgezy0s04rtdwlc0tlvxafpdrfxnsg7ww68ge3j7l0lnszsw2wt",
            amount: [
              {
                unit: "lovelace",
                quantity: "16102666",
              },
            ],
          },
        },
        {
          input: {
            outputIndex: 11,
            txHash:
              "d0b1c3a1165eecd5273409062a1efdf28f56061829fc665cf762750998cca0df",
          },
          output: {
            address:
              "addr_test1qqzgg5pcaeyea69uptl9da5g7fajm4m0yvxndx9f4lxpkehqgezy0s04rtdwlc0tlvxafpdrfxnsg7ww68ge3j7l0lnszsw2wt",
            amount: [
              {
                unit: "lovelace",
                quantity: "7722658",
              },
            ],
          },
        },
        {
          input: {
            outputIndex: 1,
            txHash:
              "fb16ad965811e400d039f5c7ebb5acd70512e221e0abc8eb85770f2df399ea29",
          },
          output: {
            address:
              "addr_test1qqzgg5pcaeyea69uptl9da5g7fajm4m0yvxndx9f4lxpkehqgezy0s04rtdwlc0tlvxafpdrfxnsg7ww68ge3j7l0lnszsw2wt",
            amount: [
              {
                unit: "lovelace",
                quantity: "2873215",
              },
            ],
          },
        },
        {
          input: {
            outputIndex: 1,
            txHash:
              "398a5993db18da4eb8485703f9f9d6a681304cbe0d2b3ad3a5f7035684e67129",
          },
          output: {
            address:
              "addr_test1qqzgg5pcaeyea69uptl9da5g7fajm4m0yvxndx9f4lxpkehqgezy0s04rtdwlc0tlvxafpdrfxnsg7ww68ge3j7l0lnszsw2wt",
            amount: [
              {
                unit: "lovelace",
                quantity: "14594553",
              },
              {
                unit: "a103a8efea8fa65b2799c841be990520e051a46f584154cdb43b0d346d65736820283029",
                quantity: "1",
              },
            ],
          },
        },
        {
          input: {
            outputIndex: 0,
            txHash:
              "b1b145db3b1c577a44a885a53720c22509598035ddc2dd9a1eb6633bcd0861b4",
          },
          output: {
            address:
              "addr_test1qqzgg5pcaeyea69uptl9da5g7fajm4m0yvxndx9f4lxpkehqgezy0s04rtdwlc0tlvxafpdrfxnsg7ww68ge3j7l0lnszsw2wt",
            amount: [
              {
                unit: "lovelace",
                quantity: "2369921413",
              },
              {
                unit: "740de29e6df5871d2203a25c9690d957fae861dd3791c1acbdc91146",
                quantity: "1",
              },
              {
                unit: "f060f0ef7fa4c3c6d3a4f831c639038db0f625c548a711f2b276a282",
                quantity: "2",
              },
            ],
          },
        },
      ];

      const requiredAssets = new Map<string, string>();
      requiredAssets.set(
        "740de29e6df5871d2203a25c9690d957fae861dd3791c1acbdc91146",
        "1",
      );
      const selectedUtxos = experimentalSelectUtxos(
        requiredAssets,
        utxos,
        "5000000",
      );
      expect(
        selectedUtxos.findIndex((utxo) => {
          return (
            utxo.input.txHash ===
              "b1b145db3b1c577a44a885a53720c22509598035ddc2dd9a1eb6633bcd0861b4" &&
            utxo.input.outputIndex === 0
          );
        }),
      ).toBeGreaterThan(-1);
    });
  });
});
