import { mConStr0, MeshTxBuilderBody } from "@meshsdk/common";
import { meshTxBuilderBodyToObj } from "@meshsdk/core-csl";

describe("meshTxBuilderBodyToObj", () => {
  it("should convert all fields of MeshTxBuilderBody to object representation", () => {
    const txBody: MeshTxBuilderBody = {
      inputs: [
        {
          type: "PubKey",
          txIn: {
            txHash:
              "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            txIndex: 0,
            amount: [{ unit: "lovelace", quantity: "1000000" }],
            address: "addr_test1234",
            scriptSize: 0,
          },
        },
      ],
      outputs: [
        {
          address: "addr_test5678",
          amount: [{ unit: "lovelace", quantity: "2000000" }],
          datum: {
            type: "Hash",
            data: { type: "Mesh", content: mConStr0([]) },
          },
        },
      ],
      fee: "500000",
      mints: [
        {
          type: "Plutus",
          policyId: "abcdef1234567890",
          mintValue: [{ assetName: "aaabbb", amount: "1" }],
          scriptSource: {
            type: "Inline",
            txHash: "1234567890abcdef",
            txIndex: 1,
            scriptHash: "scriptHash123",
            version: "V2",
            scriptSize: "100",
          },
          redeemer: {
            data: { type: "Mesh", content: mConStr0([]) },
            exUnits: { mem: 1000000, steps: 500000 },
          },
        },
      ],
      changeAddress: "addr_test9012",
      metadata: new Map([[BigInt(721), "metadata"]]),
      validityRange: {
        invalidBefore: 100,
        invalidHereafter: 200,
      },
      certificates: [
        {
          type: "BasicCertificate",
          certType: {
            type: "RegisterPool",
            poolParams: {
              operator: "operator123",
              vrfKeyHash: "vrf123",
              pledge: "1000000",
              cost: "500000",
              margin: [1, 2],
              rewardAddress: "stake_test123",
              owners: ["owner1", "owner2"],
              relays: [
                {
                  type: "SingleHostName",
                  port: 3001,
                  domainName: "relay1.test",
                },
              ],
            },
          },
        },
      ],
      withdrawals: [
        {
          type: "PubKeyWithdrawal",
          address: "stake_withdrawal_123",
          coin: "1000000",
        },
      ],
      votes: [
        {
          type: "BasicVote",
          vote: {
            voter: {
              type: "DRep",
              drepId: "drep_test123",
            },
            govActionId: {
              txHash: "1234567890abcdef",
              txIndex: 0,
            },
            votingProcedure: {
              voteKind: "Yes",
            },
          },
        },
      ],
      signingKey: ["key1", "key2"],
      collaterals: [
        {
          type: "PubKey",
          txIn: {
            txHash: "fedcba0987654321",
            txIndex: 0,
            amount: [{ unit: "lovelace", quantity: "5000000" }],
            address: "addr_test_collateral",
            scriptSize: 0,
          },
        },
      ],
      requiredSignatures: ["sig1", "sig2"],
      referenceInputs: [
        {
          txHash: "reference1234567890",
          txIndex: 0,
        },
      ],
      network: "preprod",
      chainedTxs: [],
      inputsForEvaluation: {},
      expectedNumberKeyWitnesses: 2,
      expectedByronAddressWitnesses: [],
      extraInputs: [],
      selectionConfig: {
        threshold: "",
        strategy: "largestFirst",
        includeTxFees: false,
      },
    };

    const result = meshTxBuilderBodyToObj(txBody);

    // Test the conversion of each field
    expect(result.inputs).toBeDefined();
    expect(result.inputs.length).toBe(1);
    expect(result.outputs).toBeDefined();
    expect(result.outputs.length).toBe(1);
    expect(result.fee).toBe("500000");
    expect(result.mints).toBeDefined();
    expect(result.mints.length).toBe(1);
    expect(result.changeAddress).toBe("addr_test9012");
    expect(result.metadata).toBeDefined();
    expect(result.validityRange).toBeDefined();
    expect((result.validityRange as any).invalidBefore).toBe(100);
    expect((result.validityRange as any).invalidHereafter).toBe(200);
    expect(result.certificates).toBeDefined();
    expect(result.certificates.length).toBe(1);
    expect(result.withdrawals).toBeDefined();
    expect(result.withdrawals.length).toBe(1);
    expect(result.votes).toBeDefined();
    expect(result.votes.length).toBe(1);
    expect(result.signingKey).toEqual(["key1", "key2"]);
    expect(result.collaterals).toBeDefined();
    expect(result.collaterals.length).toBe(1);
    expect(result.requiredSignatures).toEqual(["sig1", "sig2"]);
    expect(result.referenceInputs).toBeDefined();
    expect(result.referenceInputs.length).toBe(1);
    expect(result.network).toBe("preprod");
  });
});
