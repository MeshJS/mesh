import { Asset, Budget, LanguageVersion } from "@meshsdk/common";

import { MeshTxBuilderV2 } from "../src";


describe("MeshTxBuilderV2 Grouped interfaces", () => {
  it("should build a tx with spendPlutusV2", () => {
    const tx = new MeshTxBuilderV2();
    const mockHash =
      "0000000000000000000000000000000000000000000000000000000000000000";

    tx.spendPlutusV2(mockHash, 0)
      .script("112233")
      .redeemerJson({ action: "spend" })
      .txOut(
        "addr_test1vzuwvztxzv3j4a2wvy7xntry2a8y869svj4a7y7qy2wvywqzcqxny",
        []
      )
      .datumJson({ data: "foo" });

    // @ts-ignore
    tx.queueAllLastItem();

    const body = tx.meshTxBuilderBody;

    // Check we configured script spending correctly
    const input = body.inputs[0];
    expect(input?.type).toBe("Script");

    if (input?.type === "Script") {
      expect(input.txIn.txHash).toBe(mockHash);
      expect(input.txIn.txIndex).toBe(0);

      // script
      expect(input.scriptTxIn.scriptSource?.type).toBe("Provided");
      if (input.scriptTxIn.scriptSource?.type === "Provided") {
        expect(input.scriptTxIn.scriptSource?.script.code).toBe("112233");
        expect(input.scriptTxIn.scriptSource?.script.version).toBe("V2");
      }

      // datum
      expect(input.scriptTxIn.datumSource?.type).toBe("Inline");

      // redeemer
      expect(input.scriptTxIn.redeemer?.data.type).toBe("JSON");
    }

    // Output
    expect(body.outputs.length).toBe(1);
    expect(body.outputs[0]?.address).toBe(
      "addr_test1vzuwvztxzv3j4a2wvy7xntry2a8y869svj4a7y7qy2wvywqzcqxny",
    );
  });

  it("should have correct mintPlutus interface", () => {
    const tx = new MeshTxBuilderV2();
    tx.mintPlutusV2("1", "policyId123", "assetName456")
      .script("556677")
      .redeemerCbor("998877")
      .txOut(
        "addr_test1vzuwvztxzv3j4a2wvy7xntry2a8y869svj4a7y7qy2wvywqzcqxny",
        [],
      );

    // @ts-ignore
    tx.queueAllLastItem();

    const body = tx.meshTxBuilderBody;

    expect(body.mints[0]?.type).toBe("Plutus");
    expect(body.mints[0]?.policyId).toBe("policyId123");
    expect(body.mints[0]?.mintValue[0]?.amount).toBe("1");

    if (
      body.mints[0]?.type === "Plutus" &&
      body.mints[0]?.scriptSource?.type === "Provided"
    ) {
      expect(body.mints[0]?.scriptSource.script.code).toBe("556677");
    }

    expect(body.mints[0]?.redeemer?.data.type).toBe("CBOR");
  });

  it("should build a tx with withdrawPlutusV2", () => {
    const tx = new MeshTxBuilderV2();
    tx.withdrawPlutusV2("stake_test1uqevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqp8n5xl", "1000000")
      .script("445566")
      .redeemerJson({ action: "withdraw" });

    // @ts-ignore
    tx.queueAllLastItem();

    const body = tx.meshTxBuilderBody;

    expect(body.withdrawals.length).toBe(1);
    expect(body.withdrawals[0]?.type).toBe("ScriptWithdrawal");
    if (body.withdrawals[0]?.type === "ScriptWithdrawal") {
      expect(body.withdrawals[0]?.address).toBe("stake_test1uqevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqp8n5xl");
      expect(body.withdrawals[0]?.coin).toBe("1000000");

      expect(body.withdrawals[0]?.scriptSource?.type).toBe("Provided");
      if (body.withdrawals[0]?.scriptSource?.type === "Provided") {
        expect(body.withdrawals[0]?.scriptSource.script.code).toBe("445566");
      }

      expect(body.withdrawals[0]?.redeemer?.data.type).toBe("JSON");
    }
  });

  it("should build a tx with votePlutusV2", () => {
    const tx = new MeshTxBuilderV2();
    tx.votePlutusV2(
      { type: "DRep", drepId: "drep_id_here" },
      { txHash: "0000000000000000000000000000000000000000000000000000000000000000", txIndex: 0 },
      { voteKind: "Yes" }
    )
      .script("111111")
      .redeemerJson({ action: "vote" });

    // @ts-ignore
    tx.queueAllLastItem();

    const body = tx.meshTxBuilderBody;

    expect(body.votes.length).toBe(1);
    expect(body.votes[0]?.type).toBe("ScriptVote");
    if (body.votes[0]?.type === "ScriptVote") {
      expect(body.votes[0]?.vote.voter.type).toBe("DRep");
      expect(body.votes[0]?.vote.votingProcedure.voteKind).toBe("Yes");

      expect(body.votes[0]?.scriptSource?.type).toBe("Provided");
      if (body.votes[0]?.scriptSource?.type === "Provided") {
        expect(body.votes[0]?.scriptSource.script.code).toBe("111111");
      }

      expect(body.votes[0]?.redeemer?.data.type).toBe("JSON");
    }
  });
});
