import { mConStr0, MeshTxBuilderBody } from "@meshsdk/common";
import { serializeData } from "@meshsdk/core";
import {
  meshTxBuilderBodyToObj,
  txBuilderBodyFromObj,
} from "@meshsdk/core-csl";

describe("Round-trip conversion tests", () => {
  it("should maintain data integrity through object conversion round-trip", () => {
    // Create a comprehensive test fixture with all possible fields
    const originalTxBody: MeshTxBuilderBody = {
      inputs: [
        {
          type: "PubKey",
          txIn: {
            txHash:
              "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            txIndex: 0,
            amount: [{ unit: "lovelace", quantity: "1000000" }],
            address: "addr_test1234",
          },
        },
      ],
      outputs: [
        {
          address: "addr_test5678",
          amount: [{ unit: "lovelace", quantity: "2000000" }],
          datum: {
            type: "Hash",
            data: { type: "CBOR", content: serializeData(mConStr0([])) },
          },
        },
      ],
      fee: "500000",
      mints: [
        {
          type: "Plutus",
          policyId: "abcdef1234567890",
          mintValue: [{ assetName: "TestToken", amount: "1" }],
          scriptSource: {
            type: "Inline",
            txHash: "1234567890abcdef",
            txIndex: 1,
            scriptHash: "scriptHash123",
            version: "V2",
            scriptSize: "100",
          },
          redeemer: {
            data: { type: "CBOR", content: serializeData(mConStr0([])) },
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
        threshold: "5000000",
        strategy: "largestFirst",
        includeTxFees: true,
      },
    };

    // Convert to object representation
    const objectRepresentation = meshTxBuilderBodyToObj(originalTxBody);

    console.log("Object Representation:", objectRepresentation);

    // Convert back to MeshTxBuilderBody
    const restoredTxBody = txBuilderBodyFromObj(objectRepresentation);

    // Test the integrity of key fields after round trip
    expect(restoredTxBody.inputs).toHaveLength(originalTxBody.inputs.length);
    expect(restoredTxBody.outputs).toHaveLength(originalTxBody.outputs.length);
    expect(restoredTxBody.fee).toBe(originalTxBody.fee);
    expect(restoredTxBody.mints).toHaveLength(originalTxBody.mints.length);
    expect(restoredTxBody.changeAddress).toBe(originalTxBody.changeAddress);
    expect(restoredTxBody.validityRange).toEqual(originalTxBody.validityRange);
    expect(restoredTxBody.certificates).toHaveLength(
      originalTxBody.certificates.length,
    );
    expect(restoredTxBody.withdrawals).toHaveLength(
      originalTxBody.withdrawals.length,
    );
    expect(restoredTxBody.votes).toHaveLength(originalTxBody.votes.length);
    expect(restoredTxBody.signingKey).toEqual(originalTxBody.signingKey);
    expect(restoredTxBody.collaterals).toHaveLength(
      originalTxBody.collaterals.length,
    );
    expect(restoredTxBody.requiredSignatures).toEqual(
      originalTxBody.requiredSignatures,
    );
    expect(restoredTxBody.referenceInputs).toHaveLength(
      originalTxBody.referenceInputs.length,
    );
    expect(restoredTxBody.network).toBe(originalTxBody.network);

    // Deep compare specific field structures
    if (restoredTxBody.inputs[0] && originalTxBody.inputs[0]) {
      expect(restoredTxBody.inputs[0]).toEqual(originalTxBody.inputs[0]);
    }

    if (restoredTxBody.outputs[0] && originalTxBody.outputs[0]) {
      expect(restoredTxBody.outputs[0]).toEqual(originalTxBody.outputs[0]);
    }

    if (restoredTxBody.mints[0] && originalTxBody.mints[0]) {
      expect(restoredTxBody.mints[0].policyId).toBe(
        originalTxBody.mints[0].policyId,
      );
    }

    if (restoredTxBody.certificates[0] && originalTxBody.certificates[0]) {
      expect(restoredTxBody.certificates[0].type).toBe(
        originalTxBody.certificates[0].type,
      );
    }

    if (restoredTxBody.withdrawals[0] && originalTxBody.withdrawals[0]) {
      expect(restoredTxBody.withdrawals[0].type).toBe(
        originalTxBody.withdrawals[0].type,
      );
    }

    if (restoredTxBody.votes[0] && originalTxBody.votes[0]) {
      expect(restoredTxBody.votes[0].type).toBe(originalTxBody.votes[0].type);
    }
  });
});
