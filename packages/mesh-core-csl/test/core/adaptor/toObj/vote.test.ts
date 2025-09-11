import { Anchor, mConStr0, Redeemer, RefTxIn, Vote } from "@meshsdk/common";
import { serializeData } from "@meshsdk/core";
import { voteToObj } from "@meshsdk/core-csl";

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

  describe("voteToObj", () => {
    it("should convert BasicVote correctly", () => {
      const basicVote: Vote = {
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

      const result = voteToObj(basicVote);

      expect(result).toEqual({
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
      });
    });

    it("should convert ScriptVote correctly", () => {
      const scriptVote: Vote = {
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

      const result = voteToObj(scriptVote);

      expect(result).toEqual({
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
      });
    });

    it("should convert SimpleScriptVote correctly", () => {
      const simpleScriptVote: Vote = {
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

      const result = voteToObj(simpleScriptVote);

      expect(result).toEqual({
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
      });
    });

    it("should handle ConstitutionalCommittee with ScriptHash", () => {
      const scriptHashVote: Vote = {
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

      const result = voteToObj(scriptHashVote);

      expect(result).toEqual({
        basicVote: {
          voter: {
            constitutionalCommitteeHotCred: {
              scriptHash: "script123",
            },
          },
          votingProcedure: {
            voteKind: "yes",
            anchor: null,
          },
          govActionId: mockGovActionId,
        },
      });
    });

    it("should throw error for ScriptVote without scriptSource", () => {
      const invalidScriptVote: Vote = {
        type: "ScriptVote",
        vote: {
          voter: {
            type: "DRep",
            drepId: "drep123",
          },
          votingProcedure: {
            voteKind: "Yes",
          },
          govActionId: mockGovActionId,
        },
        redeemer: mockRedeemer,
      };

      expect(() => voteToObj(invalidScriptVote)).toThrow(
        "voteToObj: missing scriptSource in plutusScriptVote.",
      );
    });

    it("should throw error for ScriptVote without redeemer", () => {
      const invalidScriptVote: Vote = {
        type: "ScriptVote",
        vote: {
          voter: {
            type: "DRep",
            drepId: "drep123",
          },
          votingProcedure: {
            voteKind: "Yes",
          },
          govActionId: mockGovActionId,
        },
        scriptSource: mockScriptSource,
      } as any;

      expect(() => voteToObj(invalidScriptVote)).toThrow(
        "voteToObj: missing redeemer in plutusScriptVote.",
      );
    });

    it("should throw error for SimpleScriptVote without simpleScriptSource", () => {
      const invalidSimpleScriptVote: Vote = {
        type: "SimpleScriptVote",
        vote: {
          voter: {
            type: "DRep",
            drepId: "drep123",
          },
          votingProcedure: {
            voteKind: "Yes",
          },
          govActionId: mockGovActionId,
        },
      } as any;

      expect(() => voteToObj(invalidSimpleScriptVote)).toThrow(
        "voteToObj: missing script source in simpleScriptVote",
      );
    });
  });
});
