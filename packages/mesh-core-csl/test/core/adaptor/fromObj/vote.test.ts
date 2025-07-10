import { Anchor, mConStr0, Redeemer, RefTxIn, Vote } from "@meshsdk/common";
import { serializeData } from "@meshsdk/core";
import { voteFromObj, voteToObj } from "@meshsdk/core-csl";

describe("vote.ts", () => {
  const mockRedeemer: Redeemer = {
    data: {
      type: "CBOR",
      content: serializeData(mConStr0([])),
    },
    exUnits: {
      mem: 1000000,
      steps: 500000000,
    },
  };

  const mockScriptSource = {
    type: "Provided" as const,
    script: {
      code: "aabbcc112233445566778899aabbccddeeff",
      version: "V1" as const,
    },
  };

  const mockSimpleScriptSource = {
    type: "Provided" as const,
    scriptCode: "aabbcc112233445566778899aabbccddeeff",
  };

  const mockGovActionId: RefTxIn = {
    txHash: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    txIndex: 0,
  };

  const mockAnchor: Anchor = {
    anchorUrl: "https://example.com/anchor",
    anchorDataHash:
      "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  };

  describe("voteFromObj", () => {
    it("should convert BasicVote correctly", () => {
      const voteObj = {
        basicVote: {
          voter: {
            dRepId: "drep123",
          },
          votingProcedure: {
            voteKind: "yes",
            anchor: mockAnchor,
          },
          govActionId: mockGovActionId,
        },
      };

      const result = voteFromObj(voteObj);

      expect(result).toEqual({
        type: "BasicVote",
        vote: {
          voter: {
            type: "DRep",
            drepId: "drep123",
          },
          votingProcedure: {
            voteKind: "Yes",
            anchor: mockAnchor,
          },
          govActionId: mockGovActionId,
        },
      });
    });

    it("should convert ScriptVote correctly", () => {
      const voteObj = {
        scriptVote: {
          vote: {
            voter: {
              stakingPoolKeyHash: "abc123",
            },
            votingProcedure: {
              voteKind: "no",
              anchor: null,
            },
            govActionId: mockGovActionId,
          },
          redeemer: {
            data: mockRedeemer.data.content,
            exUnits: mockRedeemer.exUnits,
          },
          scriptSource: {
            providedScriptSource: {
              scriptCbor: mockScriptSource.script.code,
              languageVersion: mockScriptSource.script.version.toLowerCase(),
            },
          },
        },
      };

      const result = voteFromObj(voteObj);

      expect(result).toEqual({
        type: "ScriptVote",
        vote: {
          voter: {
            type: "StakingPool",
            keyHash: "abc123",
          },
          votingProcedure: {
            voteKind: "No",
          },
          govActionId: mockGovActionId,
        },
        scriptSource: mockScriptSource,
        redeemer: mockRedeemer,
      });
    });

    it("should convert SimpleScriptVote correctly", () => {
      const voteObj = {
        simpleScriptVote: {
          vote: {
            voter: {
              constitutionalCommitteeHotCred: {
                keyHash: "key123",
              },
            },
            votingProcedure: {
              voteKind: "abstain",
              anchor: null,
            },
            govActionId: mockGovActionId,
          },
          simpleScriptSource: {
            providedSimpleScriptSource: {
              scriptCbor: mockSimpleScriptSource.scriptCode,
            },
          },
        },
      };

      const result = voteFromObj(voteObj);

      expect(result).toEqual({
        type: "SimpleScriptVote",
        vote: {
          voter: {
            type: "ConstitutionalCommittee",
            hotCred: {
              type: "KeyHash",
              keyHash: "key123",
            },
          },
          votingProcedure: {
            voteKind: "Abstain",
          },
          govActionId: mockGovActionId,
        },
        simpleScriptSource: mockSimpleScriptSource,
      });
    });

    it("should throw error for invalid vote object structure", () => {
      const invalidVoteObj = {
        invalidVoteType: {},
      };

      expect(() => voteFromObj(invalidVoteObj)).toThrow(
        "Invalid vote object structure",
      );
    });
  });

  describe("Round-trip conversion", () => {
    it("should maintain data integrity for BasicVote in round-trip conversion", () => {
      const originalVote: Vote = {
        type: "BasicVote",
        vote: {
          voter: {
            type: "DRep",
            drepId: "drep123",
          },
          votingProcedure: {
            voteKind: "Yes",
            anchor: mockAnchor,
          },
          govActionId: mockGovActionId,
        },
      };

      const convertedObj = voteToObj(originalVote);
      const roundTripVote = voteFromObj(convertedObj);

      expect(roundTripVote).toEqual(originalVote);
    });

    it("should maintain data integrity for ScriptVote in round-trip conversion", () => {
      const originalVote: Vote = {
        type: "ScriptVote",
        vote: {
          voter: {
            type: "StakingPool",
            keyHash: "abc123",
          },
          votingProcedure: {
            voteKind: "No",
          },
          govActionId: mockGovActionId,
        },
        scriptSource: mockScriptSource,
        redeemer: mockRedeemer,
      };

      const convertedObj = voteToObj(originalVote);
      const roundTripVote = voteFromObj(convertedObj);

      expect(roundTripVote).toEqual(originalVote);
    });

    it("should maintain data integrity for SimpleScriptVote in round-trip conversion", () => {
      const originalVote: Vote = {
        type: "SimpleScriptVote",
        vote: {
          voter: {
            type: "ConstitutionalCommittee",
            hotCred: {
              type: "KeyHash",
              keyHash: "key123",
            },
          },
          votingProcedure: {
            voteKind: "Abstain",
          },
          govActionId: mockGovActionId,
        },
        simpleScriptSource: mockSimpleScriptSource,
      };

      const convertedObj = voteToObj(originalVote);
      const roundTripVote = voteFromObj(convertedObj);

      expect(roundTripVote).toEqual(originalVote);
    });

    it("should maintain data integrity for ConstitutionalCommittee with ScriptHash in round-trip conversion", () => {
      const originalVote: Vote = {
        type: "BasicVote",
        vote: {
          voter: {
            type: "ConstitutionalCommittee",
            hotCred: {
              type: "ScriptHash",
              scriptHash: "script123",
            },
          },
          votingProcedure: {
            voteKind: "Yes",
          },
          govActionId: mockGovActionId,
        },
      };

      const convertedObj = voteToObj(originalVote);
      const roundTripVote = voteFromObj(convertedObj);

      expect(roundTripVote).toEqual(originalVote);
    });
  });
});
