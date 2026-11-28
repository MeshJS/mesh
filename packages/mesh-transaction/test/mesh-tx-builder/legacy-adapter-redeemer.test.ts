import {
  GovernanceActionKind,
  mConStr0,
  MeshTxBuilderBody,
} from "@meshsdk/common";
import { resolveScriptHashDRepId, serializeRewardAddress } from "@meshsdk/core";

import { MeshTxBuilder, utxoToTxIn } from "../../src";
import { resetWarnings } from "../../src/mesh-tx-builder/warnings";
import { alwaysSucceedCbor, alwaysSucceedHash } from "../test-util";
import {
  accept,
  enoughUnits,
  lovelace,
  parse,
  Setup,
  setup,
} from "./legacy-adapter-util";

const anchor = {
  anchorUrl: "https://example.com/p.json",
  anchorDataHash: "cd".repeat(32),
};
const plutusDRep = resolveScriptHashDRepId(alwaysSucceedHash);
const scriptRewardAddress = serializeRewardAddress(alwaysSucceedHash, true, 0);
const action = { txHash: "1".repeat(64), txIndex: 0 };
// The emulated network's govActionDeposit
const govActionDeposit = 1_000_000_000n;

/** The redeemer a case gives: real data, empty data on purpose, or none */
type Given = "data" | "empty";

/** One kind of Plutus script part the old API queues, and the item of the body holding it */
type Kind = {
  kind: string;
  /** The published builder's words for the part that lacks a redeemer */
  message: string;
  /** The redeemer tag of the part */
  tag: number;
  /** Puts the ledger state the part needs on the emulator */
  prepare?: (context: Setup) => void;
  /** Queues the part, with the redeemer given */
  queue: (builder: MeshTxBuilder, context: Setup, given: Given) => void;
  /** Removes the part's redeemer from a body that holds it */
  strip: (body: MeshTxBuilderBody) => void;
};

const redeemerOf = (given: Given) =>
  given === "data" ? mConStr0([]) : ("" as const);

const kinds: Kind[] = [
  {
    kind: "spend",
    message: "A script input had no redeemer",
    tag: 0,
    queue: (builder, { locked }, given) =>
      builder
        .spendingPlutusScriptV3()
        .txIn(...utxoToTxIn(locked))
        .txInInlineDatumPresent()
        .spendingReferenceTxInRedeemerValue(
          redeemerOf(given),
          "Mesh",
          enoughUnits,
        )
        .txInScript(alwaysSucceedCbor),
    strip: (body) => {
      for (const input of body.inputs)
        if (input.type === "Script") delete input.scriptTxIn.redeemer;
    },
  },
  {
    kind: "mint",
    message: "A redeemer was not provided for a plutus mint",
    tag: 1,
    queue: (builder, _context, given) =>
      builder
        .mintPlutusScriptV3()
        .mint("1", alwaysSucceedHash, "")
        .mintingScript(alwaysSucceedCbor)
        .mintRedeemerValue(redeemerOf(given), "Mesh", enoughUnits),
    strip: (body) => {
      for (const item of body.mints)
        if (item.type === "Plutus") delete item.redeemer;
    },
  },
  {
    kind: "withdrawal",
    message: "A redeemer was not provided for a plutus withdrawal",
    tag: 3,
    prepare: ({ emulator }) =>
      emulator.setAccount({ rewardAddress: scriptRewardAddress }),
    queue: (builder, _context, given) =>
      builder
        .withdrawalPlutusScriptV3()
        .withdrawal(scriptRewardAddress, "0")
        .withdrawalScript(alwaysSucceedCbor)
        .withdrawalRedeemerValue(redeemerOf(given), "Mesh", enoughUnits),
    strip: (body) => {
      for (const item of body.withdrawals)
        if (item.type === "ScriptWithdrawal") delete item.redeemer;
    },
  },
  {
    kind: "certificate",
    message: "A redeemer was not provided for a plutus certificate",
    tag: 2,
    prepare: ({ emulator }) =>
      emulator.setAccount({ rewardAddress: scriptRewardAddress }),
    queue: (builder, _context, given) =>
      builder
        .voteDelegationCertificate({ alwaysAbstain: null }, scriptRewardAddress)
        .certificateScript(alwaysSucceedCbor, "V3")
        .certificateRedeemerValue(redeemerOf(given), "Mesh", enoughUnits),
    strip: (body) => {
      for (const item of body.certificates)
        if (item.type === "ScriptCertificate") delete item.redeemer;
    },
  },
  {
    kind: "vote",
    message: "A redeemer was not provided for a plutus vote",
    tag: 4,
    prepare: ({ emulator }) => {
      emulator.setDRep({ drepId: plutusDRep });
      emulator.setGovernanceAction({
        transactionId: action.txHash,
        govActionIndex: action.txIndex,
        kind: GovernanceActionKind.InfoAction,
      });
    },
    queue: (builder, _context, given) =>
      builder
        .votePlutusScriptV3()
        .vote({ type: "DRep", drepId: plutusDRep }, action, {
          voteKind: "Yes",
        })
        .voteScript(alwaysSucceedCbor)
        .voteRedeemerValue(redeemerOf(given), "Mesh", enoughUnits),
    strip: (body) => {
      for (const item of body.votes)
        if (item.type === "ScriptVote") delete item.redeemer;
    },
  },
  {
    kind: "proposal",
    message: "A redeemer was not provided for a plutus proposal",
    tag: 5,
    prepare: ({ emulator, address }) => {
      emulator.setAccount({ rewardAddress: scriptRewardAddress });
      emulator.setTreasury("1000000000000");
      emulator.setConstitution({
        anchor,
        guardrailScriptHash: alwaysSucceedHash,
      });
      emulator.fund(address, { lovelace: govActionDeposit + 100_000_000n });
    },
    queue: (builder, _context, given) =>
      builder
        .proposal(
          {
            kind: "TreasuryWithdrawalsAction",
            action: {
              withdrawals: { [scriptRewardAddress]: "10" },
              policyHash: { bytes: alwaysSucceedHash },
            },
          },
          anchor,
          scriptRewardAddress,
          String(govActionDeposit),
        )
        .proposalScript(alwaysSucceedCbor, "V3")
        .proposalRedeemerValue(redeemerOf(given), "Mesh", enoughUnits),
    strip: (body) => {
      for (const item of body.proposals)
        if (item.type === "ScriptProposal") delete item.redeemer;
    },
  },
];

/** The redeemer tags a transaction carries */
const tagsOf = (txHex: string) =>
  (parse(txHex).witnessSet().redeemers()?.values() ?? []).map((r) => r.tag());

/**
 * A builder with the part queued and a key input and collateral declared in full, so that the
 * synchronous builds and the queries have every output's data
 */
const offline = (context: Setup, kind: Kind, given: Given) => {
  const builder = new MeshTxBuilder();
  kind.queue(builder, context, given);
  return builder
    .txIn(...utxoToTxIn(context.funds))
    .txInCollateral(...collateralOf(context))
    .txOut(context.address, lovelace(5_000_000))
    .changeAddress(context.address);
};

/** The wallet's funding UTxO as `txInCollateral` takes it */
function collateralOf({ funds }: Setup) {
  const [txHash, txIndex, amount, address] = utxoToTxIn(funds);
  return [txHash, txIndex, amount, address] as const;
}

/** The body of a builder with every queued item in it */
const bodyOf = (builder: MeshTxBuilder) => {
  (builder as unknown as { queueAllLastItem(): void }).queueAllLastItem();
  return builder.meshTxBuilderBody;
};

/** The same body without the part's redeemer */
const stripped = (context: Setup, kind: Kind) => {
  const body = bodyOf(offline(context, kind, "data"));
  kind.strip(body);
  return body;
};

/** A builder holding the body given */
const holding = (body: MeshTxBuilderBody) => {
  const builder = new MeshTxBuilder();
  builder.meshTxBuilderBody = body;
  return builder;
};

/** Every synchronous build and body query, each on a builder holding the body */
const syncBuilds = (body: () => MeshTxBuilderBody) => ({
  completeSync: () => new MeshTxBuilder().completeSync(body()),
  completeUnbalanced: () => new MeshTxBuilder().completeUnbalanced(body()),
  completeUnbalancedSync: () =>
    new MeshTxBuilder().completeUnbalancedSync(body()),
  serializeMockTx: () => holding(body()).serializeMockTx(),
  getSerializedSize: () => holding(body()).getSerializedSize(),
  calculateFee: () => holding(body()).calculateFee(),
  calculateRefScriptFee: () => holding(body()).calculateRefScriptFee(),
  calculateRedeemersFee: () => holding(body()).calculateRedeemersFee(),
});

describe.each(["scalus", "cquisitor"] as const)(
  "MeshTxBuilder refuses a Plutus script part without a redeemer, on TxEmulator (%s)",
  (validator) => {
    beforeEach(() => resetWarnings());

    describe.each(kinds.map((kind) => [kind.kind, kind] as const))(
      "%s",
      (_name, kind) => {
        const prepared = async () => {
          const context = await setup(validator);
          kind.prepare?.(context);
          return context;
        };
        const online = async (context: Setup, given: Given) => {
          const builder = new MeshTxBuilder({ fetcher: context.emulator });
          kind.queue(builder, context, given);
          // The wallet's UTxOs, the reference script holder left out
          const utxos = await context.emulator.fetchAddressUTxOs(
            context.address,
          );
          return builder
            .changeAddress(context.address)
            .selectUtxosFrom(
              utxos.filter(
                (u) => u.input.txHash !== context.holder.input.txHash,
              ),
            );
        };

        it.each(["data", "empty"] as const)(
          "builds with a redeemer given (%s): complete() is accepted, the sync builds and queries answer",
          async (given) => {
            const context = await prepared();
            const txHex = await (await online(context, given)).complete();
            expect(tagsOf(txHex)).toContain(kind.tag);
            await accept(context, txHex);

            for (const [name, run] of Object.entries(
              syncBuilds(() => bodyOf(offline(context, kind, given))),
            ))
              expect([name, run()]).toEqual([name, expect.anything()]);
            expect(
              tagsOf(
                new MeshTxBuilder().completeSync(
                  bodyOf(offline(context, kind, given)),
                ),
              ),
            ).toContain(kind.tag);
          },
        );

        it("refuses a body that holds the part without a redeemer: complete(), the sync builds and queries", async () => {
          const context = await prepared();
          const refusal = expect.objectContaining({
            code: "WITNESS_MISMATCH",
            part: kind.kind,
            message: expect.stringContaining(kind.message),
          });

          const builder = await online(context, "data");
          kind.strip(bodyOf(builder));
          await expect(builder.complete()).rejects.toEqual(refusal);
          await expect(
            new MeshTxBuilder({ fetcher: context.emulator }).complete(
              stripped(context, kind),
            ),
          ).rejects.toEqual(refusal);

          for (const [name, run] of Object.entries(
            syncBuilds(() => stripped(context, kind)),
          )) {
            let error: unknown;
            try {
              run();
            } catch (caught) {
              error = caught;
            }
            expect([name, error]).toEqual([name, refusal]);
            expect(error).toBeInstanceOf(Error);
          }
        });
      },
    );

    it("names the part that lacks the redeemer", async () => {
      const context = await setup(validator);
      const message = (kind: Kind) => {
        try {
          new MeshTxBuilder().completeSync(stripped(context, kind));
        } catch (error) {
          return (error as Error).message;
        }
        throw new Error("expected an error");
      };
      const [spend, mint, withdrawal, certificate, vote, proposal] = kinds;
      const { txHash, outputIndex } = context.locked.input;
      expect(message(spend!)).toBe(
        `spend: A script input had no redeemer: ${txHash}#${outputIndex}`,
      );
      expect(message(mint!)).toBe(
        `mint: A redeemer was not provided for a plutus mint: policy ${alwaysSucceedHash}`,
      );
      expect(message(withdrawal!)).toBe(
        `withdrawal: A redeemer was not provided for a plutus withdrawal: ${scriptRewardAddress}`,
      );
      expect(message(certificate!)).toBe(
        "certificate: A redeemer was not provided for a plutus certificate: VoteDelegation at index 0",
      );
      expect(message(vote!)).toBe(
        `vote: A redeemer was not provided for a plutus vote: voter ${plutusDRep}`,
      );
      const committeeVote: Kind = {
        ...vote!,
        queue: (builder, _context, given) =>
          builder
            .votePlutusScriptV3()
            .vote(
              {
                type: "ConstitutionalCommittee",
                hotCred: { type: "ScriptHash", scriptHash: alwaysSucceedHash },
              },
              action,
              { voteKind: "Yes" },
            )
            .voteScript(alwaysSucceedCbor)
            .voteRedeemerValue(redeemerOf(given), "Mesh", enoughUnits),
      };
      expect(message(committeeVote)).toBe(
        `vote: A redeemer was not provided for a plutus vote: voter ${alwaysSucceedHash}`,
      );
      expect(message(proposal!)).toBe(
        "proposal: A redeemer was not provided for a plutus proposal: TreasuryWithdrawalsAction at index 0",
      );
    });

    it("refuses a mint and a certificate queued without a redeemer, as the old calls allow", async () => {
      const context = await setup(validator);
      context.emulator.setAccount({ rewardAddress: scriptRewardAddress });
      const mint = new MeshTxBuilder({ fetcher: context.emulator })
        .mintPlutusScriptV3()
        .mint("1", alwaysSucceedHash, "")
        .mintingScript(alwaysSucceedCbor)
        .changeAddress(context.address)
        .selectUtxosFrom([context.funds]);
      await expect(mint.complete()).rejects.toThrow(
        "A redeemer was not provided for a plutus mint",
      );
      const certificate = new MeshTxBuilder({ fetcher: context.emulator })
        .voteDelegationCertificate({ alwaysAbstain: null }, scriptRewardAddress)
        .certificateScript(alwaysSucceedCbor, "V3")
        .changeAddress(context.address)
        .selectUtxosFrom([context.funds]);
      await expect(certificate.complete()).rejects.toThrow(
        "A redeemer was not provided for a plutus certificate",
      );
    });

    it("refuses a second vote of a script voter that lacks its redeemer", async () => {
      const context = await setup(validator);
      const builder = new MeshTxBuilder()
        .txIn(...utxoToTxIn(context.funds))
        .txInCollateral(...collateralOf(context))
        .changeAddress(context.address);
      for (const txHash of ["1".repeat(64), "2".repeat(64)])
        builder
          .votePlutusScriptV3()
          .vote(
            { type: "DRep", drepId: plutusDRep },
            { txHash, txIndex: 0 },
            { voteKind: "Yes" },
          )
          .voteScript(alwaysSucceedCbor)
          .voteRedeemerValue(mConStr0([]), "Mesh", enoughUnits);
      const body = bodyOf(builder);
      expect(tagsOf(new MeshTxBuilder().completeSync(body))).toEqual([4]);
      delete (body.votes[1] as { redeemer?: unknown }).redeemer;
      expect(() => new MeshTxBuilder().completeSync(body)).toThrow(
        "A redeemer was not provided for a plutus vote",
      );
    });
  },
);
