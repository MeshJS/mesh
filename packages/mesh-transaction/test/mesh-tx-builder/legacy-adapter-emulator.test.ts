import {
  CachedFetcher,
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  emptyTxBuilderBody,
  IEvaluator,
  IFetcher,
  mConStr0,
  MeshTxBuilderBody,
  UTxO,
} from "@meshsdk/common";
import { CSLSerializer } from "@meshsdk/core-csl";
import {
  CardanoSDKSerializer,
  resolveScriptHashDRepId,
  Serialization,
  transactionPrototypeFromHex,
} from "@meshsdk/core-cst";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import {
  LargestFirstInputSelector,
  MeshTxBuilder,
  MeshTxBuilderOptions,
  MeshTxBuilderV2,
  Transaction,
  utxoToTxIn,
} from "../../src";
import { IInputSelector } from "../../src/mesh-tx-builder/coin-selection/coin-selection-interface";
import { resetWarnings } from "../../src/mesh-tx-builder/warnings";
import { minCoin, minFee, output } from "../../src/tx-builder";
import { exUnitsFee, refScriptFee } from "../../src/tx-builder/fee";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
} from "../test-util";
import {
  accept,
  DEFAULT_COST_MODELS,
  enoughUnits,
  failingFor,
  lovelace,
  parse,
  protocolOf,
  recordingEvaluator,
  scriptAddress,
  scriptRef,
  setup,
  stating,
  unitsOf,
  unlock,
  utxoAt,
  walletOf,
  words,
} from "./legacy-adapter-util";

describe("MeshTxBuilder options", () => {
  it("refuses a serializer or a selector that is not Mesh's", () => {
    expect(
      () =>
        new MeshTxBuilder({
          serializer: {
            serializeTxBody() {},
          } as unknown as MeshTxBuilderOptions["serializer"],
        }),
    ).toThrow(
      expect.objectContaining({
        code: "INVALID_OPTION",
        details: expect.objectContaining({ option: "serializer" }),
      }),
    );
    const mine: IInputSelector = { select: async () => ({}) as never };
    expect(() => new MeshTxBuilder({ selector: mine })).toThrow(
      expect.objectContaining({
        code: "INVALID_OPTION",
        details: expect.objectContaining({ option: "selector" }),
      }),
    );
  });

  it("accepts Mesh's serializers, their subclasses and copies, and Mesh's selectors", () => {
    class MySerializer extends CardanoSDKSerializer {}
    for (const serializer of [
      new CardanoSDKSerializer(),
      new CSLSerializer(),
      new MySerializer(),
      Object.create(CardanoSDKSerializer.prototype),
    ])
      expect(new MeshTxBuilder({ serializer }).serializer).toBe(serializer);
    const other = new MeshTxBuilder();
    expect(other.selector).toBeInstanceOf(LargestFirstInputSelector);
    for (const selector of [new LargestFirstInputSelector(), other.selector])
      expect(new MeshTxBuilder({ selector }).selector).toBe(selector);
  });

  it("keeps LargestFirstInputSelector as a mark whose select() rejects", async () => {
    await expect(
      new LargestFirstInputSelector().select(
        [],
        [],
        { withdrawals: 0n, deposit: 0n, reclaimDeposit: 0n, mint: [] },
        [],
        baseAddress(0),
        {} as never,
      ),
    ).rejects.toThrow(/coinSelection of TxBuilder/);
  });

  it("isHydra lays five zeros over params, and keeps the others", () => {
    const hydra = new MeshTxBuilder({
      isHydra: true,
      params: { maxTxSize: 12345, minFeeA: 99, collateralPercent: 0 },
    });
    expect(protocolOf(hydra)).toMatchObject({
      maxTxSize: 12345,
      minFeeA: 0,
      minFeeB: 0,
      priceMem: 0,
      priceStep: 0,
      coinsPerUtxoSize: 0,
      collateralPercent: 0,
      minFeeRefScriptCostPerByte:
        DEFAULT_PROTOCOL_PARAMETERS.minFeeRefScriptCostPerByte,
    });
    // A later call does not bring a fee back into a head
    hydra.protocolParams({ minFeeA: 44 });
    expect(protocolOf(hydra).minFeeA).toBe(0);
    expect(
      protocolOf(new MeshTxBuilder({ isHydra: true })).collateralPercent,
    ).toBe(DEFAULT_PROTOCOL_PARAMETERS.collateralPercent);
  });

  it("keeps the network's maxTxExMem in the built-in parameters", () => {
    expect(DEFAULT_PROTOCOL_PARAMETERS.maxTxExMem).toBe("16500000");
  });
});

describe("MeshTxBuilder's synchronous methods and body queries", () => {
  const address = baseAddress(0);

  describe.each([
    ["CardanoSDKSerializer", () => new CardanoSDKSerializer()],
    ["CSLSerializer", () => new CSLSerializer()],
  ] as const)("with %s", (_, serializer) => {
    const builder = () => new MeshTxBuilder({ serializer: serializer() });

    it("refuses an input without amount and a reference script without size: UNRESOLVED naming each", () => {
      const noAmount = builder()
        .txIn("c".repeat(64), 1)
        .txOut(address, lovelace(2_000_000))
        .changeAddress(address);
      expect(() => noAmount.completeSync()).toThrow(
        expect.objectContaining({
          code: "UNRESOLVED",
          details: [
            {
              kind: "spend",
              gaps: [
                {
                  type: "utxo",
                  input: { transaction_id: "c".repeat(64), index: 1 },
                },
              ],
            },
          ],
        }),
      );

      const noSize = builder()
        .spendingPlutusScriptV3()
        .txIn("c".repeat(64), 0, lovelace(20_000_000), scriptAddress, 0)
        .txInInlineDatumPresent()
        .txInRedeemerValue(mConStr0([]), "Mesh", enoughUnits)
        .spendingTxInReference("d".repeat(64), 2, undefined, alwaysSucceedHash)
        .changeAddress(address);
      expect(() => noSize.completeSync()).toThrow(
        expect.objectContaining({
          code: "UNRESOLVED",
          details: [
            expect.objectContaining({
              kind: "spend",
              gaps: [
                {
                  type: "scriptReference",
                  input: { transaction_id: "d".repeat(64), index: 2 },
                },
              ],
            }),
          ],
        }),
      );
    });

    it("refuses a collateral without amount or address: UNRESOLVED naming it", () => {
      const noAmount = builder()
        .spendingPlutusScriptV3()
        .txIn("c".repeat(64), 0, lovelace(20_000_000), scriptAddress, 0)
        .txInInlineDatumPresent()
        .txInRedeemerValue(mConStr0([]), "Mesh", enoughUnits)
        .txInScript(alwaysSucceedCbor)
        .txInCollateral("e".repeat(64), 1)
        .changeAddress(address);
      expect(() => noAmount.completeSync()).toThrow(
        expect.objectContaining({
          code: "UNRESOLVED",
          details: [
            {
              kind: "collateral",
              gaps: [
                {
                  type: "utxo",
                  input: { transaction_id: "e".repeat(64), index: 1 },
                },
              ],
            },
          ],
        }),
      );
    });

    it("assembles a read-only reference given by out ref alone", () => {
      const txHex = builder()
        .txIn("c".repeat(64), 0, lovelace(20_000_000), address, 0)
        .readOnlyTxInReference("d".repeat(64), 3)
        .txOut(address, lovelace(2_000_000))
        .changeAddress(address)
        .completeSync();
      const refs = parse(txHex).body().referenceInputs()!.values();
      expect(
        refs.map((r) => [r.transactionId().toString(), r.index()]),
      ).toEqual([["d".repeat(64), 3n]]);
    });
  });

  it("completeUnbalanced() and completeUnbalancedSync() build the body as given", () => {
    const build = (complete: "completeUnbalanced" | "completeUnbalancedSync") =>
      new MeshTxBuilder()
        .txIn("c".repeat(64), 0, lovelace(20_000_000), address, 0)
        .txOut(address, lovelace(2_000_000))
        .txOut(address, [])
        .setFee("200000")
        .changeAddress(address)
        [complete]();
    for (const complete of [
      "completeUnbalanced",
      "completeUnbalancedSync",
    ] as const) {
      const body = parse(build(complete)).body();
      expect(body.fee()).toBe(200_000n);
      // No change is made; an output without lovelace holds its minimum
      expect(body.outputs()).toHaveLength(2);
      expect(body.outputs()[1]!.amount().coin()).toBe(
        minCoin(output({ address, value: {} }), DEFAULT_PROTOCOL_PARAMETERS),
      );
    }
  });

  describe("a body given to them", () => {
    /** A body other code made: a payment, its fee set by hand */
    const madeElsewhere = () => {
      const builder = new MeshTxBuilder()
        .txIn("c".repeat(64), 0, lovelace(20_000_000), address, 0)
        .txOut(address, lovelace(2_000_000))
        .setFee("200000")
        .changeAddress(address);
      const txHex = builder.completeSync();
      return { body: builder.meshTxBuilderBody, txHex };
    };

    it("is built in place of the builder's own", () => {
      const { body, txHex } = madeElsewhere();
      for (const complete of [
        "completeSync",
        "completeUnbalanced",
        "completeUnbalancedSync",
      ] as const)
        expect(new MeshTxBuilder()[complete]({ ...body })).toBe(txHex);
    });

    it("sets the fee it holds by hand in completeUnbalancedSync(), but not a fee of 0", () => {
      const { body } = madeElsewhere();
      const given = new MeshTxBuilder();
      const txHex = given.completeUnbalancedSync({ ...body, fee: "300000" });
      expect(parse(txHex).body().fee()).toBe(300_000n);
      expect(given.getActualFee()).toBe(300_000n);

      // "0" is the fee of an empty or parsed body, not one set by hand
      const parsed = new MeshTxBuilder();
      expect(
        parse(parsed.completeUnbalancedSync({ ...body, fee: "0" }))
          .body()
          .fee(),
      ).toBe(0n);
      expect(parsed.getActualFee()).toBe(parsed.calculateFee());
      expect(parsed.getActualFee()).toBeGreaterThan(0n);
    });
  });

  describe("outputs the builder holds", () => {
    const held = utxoAt("f".repeat(64), address, 30_000_000n);
    const holder = utxoAt("b".repeat(64), address, 30_000_000n, { scriptRef });

    it("stand in for an input given by out ref alone", () => {
      const byOutRef = () =>
        new MeshTxBuilder()
          .txIn(held.input.txHash, 0)
          .txOut(address, lovelace(2_000_000))
          .changeAddress(address);
      expect(() => byOutRef().completeSync()).toThrow(
        expect.objectContaining({ code: "UNRESOLVED" }),
      );
      for (const hold of [
        (b: MeshTxBuilder) => b.inputForEvaluation(held),
        (b: MeshTxBuilder) => b.selectUtxosFrom([held]),
      ]) {
        const builder = hold(byOutRef());
        const tx = parse(builder.completeSync());
        expect(
          tx
            .body()
            .inputs()
            .values()
            .map((i) => i.transactionId().toString()),
        ).toEqual([held.input.txHash]);
        // The fee sizes the input's key witness: the address is the held output's
        expect(builder.calculateFee()).toBeGreaterThan(0n);
        expect(builder.meshTxBuilderBody.expectedNumberKeyWitnesses).toBe(1);
      }
    });

    it("price the reference script they hold, and a declared size for them is not added", () => {
      const price = DEFAULT_PROTOCOL_PARAMETERS.minFeeRefScriptCostPerByte;
      const reading = (size?: number) => {
        const builder = new MeshTxBuilder()
          .txIn("c".repeat(64), 0, lovelace(100_000_000), address, 0)
          .readOnlyTxInReference(holder.input.txHash, 0, size)
          .txOut(address, lovelace(2_000_000))
          .changeAddress(address)
          .inputForEvaluation(holder);
        builder.completeSync();
        return builder;
      };
      const heldFee = refScriptFee(BigInt(scriptRef.length / 2), price);
      expect(heldFee).toBeGreaterThan(0n);
      expect(reading().calculateRefScriptFee()).toBe(heldFee);
      expect(reading(5000).calculateRefScriptFee()).toBe(heldFee);
    });
  });

  it("assembles a stake and a pool registration, their deposits not stated by the calls", () => {
    const rewardAddress =
      "stake_test1uzw5mnt7g4xjgdqkfa80hrk7kdvds6sa4k0vvgjvlj7w8eskffj2n";
    const txHex = new MeshTxBuilder()
      .txIn("c".repeat(64), 0, lovelace(1_000_000_000), address, 0)
      .registerStakeCertificate(rewardAddress)
      .registerPoolCertificate({
        vrfKeyHash: "11".repeat(32),
        operator: "22".repeat(28),
        pledge: "0",
        cost: "340000000",
        margin: [1, 100],
        relays: [],
        owners: ["22".repeat(28)],
        rewardAddress,
      })
      .changeAddress(address)
      .completeSync();
    const certificates = parse(txHex).body().certs()!.values();
    expect(certificates).toHaveLength(2);
    expect(certificates[0]!.asStakeRegistration()).toBeDefined();
    expect(certificates[1]!.asPoolRegistration()).toBeDefined();
  });

  it("voteTxInReference records the version of the vote script", () => {
    const voter = { type: "DRep" as const, drepId: "drep1" };
    const builder = new MeshTxBuilder()
      .votePlutusScriptV3()
      .vote(voter, { txHash: "c".repeat(64), txIndex: 0 }, { voteKind: "Yes" })
      .voteTxInReference("d".repeat(64), 0, "100", alwaysSucceedHash)
      .voteRedeemerValue(mConStr0([]));
    // A second vote queues the first
    builder.vote(
      voter,
      { txHash: "c".repeat(64), txIndex: 1 },
      { voteKind: "No" },
    );
    const [first] = builder.meshTxBuilderBody.votes;
    expect(first!.type === "ScriptVote" && first!.scriptSource).toMatchObject({
      type: "Inline",
      version: "V3",
    });
  });

  describe("queries", () => {
    /** A payment from a declared input with a token output, and a Plutus mint */
    const body = () =>
      new MeshTxBuilder()
        .txIn("c".repeat(64), 0, lovelace(100_000_000), address, 0)
        .txOut(address, [
          ...lovelace(2_000_000),
          { unit: alwaysSucceedHash + "aa", quantity: "1" },
        ])
        .mintPlutusScriptV3()
        .mint("1", alwaysSucceedHash, "aa")
        .mintingScript(alwaysSucceedCbor)
        .mintRedeemerValue(mConStr0([]), "Mesh", enoughUnits)
        .txInCollateral("e".repeat(64), 0, lovelace(10_000_000), address)
        .changeAddress(address);

    it("calculateMinLovelaceForOutput() is minCoin of the output", () => {
      const out = {
        address: scriptAddress,
        amount: [{ unit: alwaysSucceedHash + "aa", quantity: "5" }],
        datum: {
          type: "Inline" as const,
          data: { type: "Mesh" as const, content: mConStr0([]) },
        },
      };
      const part = output({
        address: scriptAddress,
        value: { [alwaysSucceedHash + "aa"]: 5n },
        datum: { type: "inline", data: mConStr0([]) },
      });
      const builder = new MeshTxBuilder();
      expect(builder.calculateMinLovelaceForOutput(out)).toBe(
        minCoin(part, DEFAULT_PROTOCOL_PARAMETERS),
      );
      const hydra = new MeshTxBuilder({ isHydra: true });
      expect(hydra.calculateMinLovelaceForOutput(out)).toBe(0n);
    });

    it("sizes and prices the body once signed", () => {
      const builder = body();
      // The queries see the body as the calls left it
      builder.completeSync();
      const mock = builder.serializeMockTx();
      expect(builder.getSerializedSize() * 2).toBe(mock.length);
      const tx = parse(mock);
      // A key for the input, the collateral being the same address
      expect(builder.meshTxBuilderBody.expectedNumberKeyWitnesses).toBe(1);
      expect(tx.witnessSet().vkeys()?.size()).toBe(1);

      const params = DEFAULT_PROTOCOL_PARAMETERS;
      expect(builder.calculateFee()).toBe(
        minFee(transactionPrototypeFromHex(mock), {
          params,
          vkeyWitnesses: builder.meshTxBuilderBody.expectedNumberKeyWitnesses,
        }),
      );
      // The ledger's minimum for the encoded transaction: size, then the units rounded up once
      expect(builder.calculateFee()).toBe(
        BigInt(params.minFeeA) * BigInt(mock.length / 2) +
          BigInt(params.minFeeB) +
          exUnitsFee(
            BigInt(enoughUnits.mem),
            BigInt(enoughUnits.steps),
            params,
          ),
      );
      expect(builder.calculateFee()).toBe(
        builder.calculateFeeForSerializedTx(builder.getSerializedSize()),
      );
      expect(builder.getTotalExecutionUnits()).toEqual({
        memUnits: BigInt(enoughUnits.mem),
        stepUnits: BigInt(enoughUnits.steps),
      });
      expect(builder.calculateRedeemersFee()).toBe(
        exUnitsFee(BigInt(enoughUnits.mem), BigInt(enoughUnits.steps), params),
      );
      expect(builder.calculateRefScriptFee()).toBe(0n);
      expect(builder.getActualFee()).toBe(builder.calculateFee());
      builder.setFee("1234567");
      expect(builder.getActualFee()).toBe(1_234_567n);
    });

    it("prices the redeemers of the transaction: an exact repeat and the votes of one voter share one", () => {
      const params = DEFAULT_PROTOCOL_PARAMETERS;
      const units = { mem: 1_000_000, steps: 500_000_000 };
      const oneRedeemer = exUnitsFee(
        BigInt(units.mem),
        BigInt(units.steps),
        params,
      );
      const spend = (builder: MeshTxBuilder) =>
        builder
          .spendingPlutusScriptV3()
          .txIn("c".repeat(64), 0, lovelace(20_000_000), scriptAddress, 0)
          .txInInlineDatumPresent()
          .txInRedeemerValue(mConStr0([]), "Mesh", units)
          .txInScript(alwaysSucceedCbor);
      const drep = {
        type: "DRep" as const,
        drepId: resolveScriptHashDRepId(alwaysSucceedHash),
      };
      const vote = (builder: MeshTxBuilder, index: number) =>
        builder
          .votePlutusScriptV3()
          .vote(
            drep,
            { txHash: "a".repeat(64), txIndex: index },
            { voteKind: "Yes" },
          )
          .voteScript(alwaysSucceedCbor)
          .voteRedeemerValue(mConStr0([]), "Mesh", units);
      const finish = (builder: MeshTxBuilder) =>
        builder
          .txIn("d".repeat(64), 0, lovelace(100_000_000), address, 0)
          .txOut(address, lovelace(2_000_000))
          .txInCollateral("e".repeat(64), 0, lovelace(10_000_000), address)
          .setFee("1000000")
          .changeAddress(address);

      const repeated = finish(spend(spend(new MeshTxBuilder())));
      const votes = finish(vote(vote(new MeshTxBuilder(), 0), 1));
      for (const builder of [repeated, votes]) {
        const tx = parse(builder.completeSync());
        expect(tx.witnessSet().redeemers()!.size()).toBe(1);
        // The body holds two, and the query adds both up
        expect(builder.getTotalExecutionUnits()).toEqual({
          memUnits: 2n * BigInt(units.mem),
          stepUnits: 2n * BigInt(units.steps),
        });
        expect(builder.calculateRedeemersFee()).toBe(oneRedeemer);
        const mock = builder.serializeMockTx();
        expect(builder.calculateFee()).toBe(
          minFee(transactionPrototypeFromHex(mock), {
            params,
            vkeyWitnesses: builder.meshTxBuilderBody.expectedNumberKeyWitnesses,
          }),
        );
      }
    });

    it("prices the reference-script sizes the calls declare", () => {
      const sized = (inputSize: number, readSize: number) => {
        const builder = new MeshTxBuilder()
          .txIn("c".repeat(64), 0, lovelace(100_000_000), address, inputSize)
          .readOnlyTxInReference("d".repeat(64), 0, readSize)
          .txOut(address, lovelace(2_000_000))
          .changeAddress(address);
        builder.completeSync();
        return builder;
      };
      const price = DEFAULT_PROTOCOL_PARAMETERS.minFeeRefScriptCostPerByte;
      expect(sized(500, 300).calculateRefScriptFee()).toBe(
        refScriptFee(800n, price),
      );
      expect(sized(500, 300).calculateFee() - sized(0, 0).calculateFee()).toBe(
        refScriptFee(800n, price),
      );
    });

    it("refuses an input without amount: UNRESOLVED", () => {
      // The second input queues the first, which has no amount
      const builder = new MeshTxBuilder()
        .txIn("c".repeat(64), 0)
        .txIn("d".repeat(64), 0, lovelace(20_000_000), address, 0)
        .changeAddress(address);
      for (const query of [
        () => builder.serializeMockTx(),
        () => builder.calculateFee(),
        () => builder.calculateRefScriptFee(),
      ])
        expect(query).toThrow(expect.objectContaining({ code: "UNRESOLVED" }));
    });
  });

  it("keeps every public member but the old assembly steps", () => {
    const builder = new MeshTxBuilder({
      fetcher: {} as IFetcher,
      submitter: { submitTx: async () => "" },
      evaluator: { evaluateTx: async () => [] },
    });
    const kept = [
      // fluent methods
      ..."txIn txInScript txInDatumValue txInInlineDatumPresent simpleScriptTxInReference txInRedeemerValue txOut txOutDatumHashValue txOutInlineDatumValue txOutDatumEmbedValue txOutReferenceScript spendingPlutusScript spendingPlutusScriptV1 spendingPlutusScriptV2 spendingPlutusScriptV3 spendingTxInReference spendingReferenceTxInInlineDatumPresent spendingReferenceTxInRedeemerValue readOnlyTxInReference mintPlutusScript mintPlutusScriptV1 mintPlutusScriptV2 mintPlutusScriptV3 mint mintingScript mintTxInReference mintReferenceTxInRedeemerValue mintRedeemerValue requiredSignerHash txInCollateral withdrawalPlutusScript withdrawalPlutusScriptV1 withdrawalPlutusScriptV2 withdrawalPlutusScriptV3 withdrawal withdrawalScript withdrawalTxInReference withdrawalRedeemerValue votePlutusScript votePlutusScriptV1 votePlutusScriptV2 votePlutusScriptV3 vote voteScript voteTxInReference voteRedeemerValue proposal proposalScript proposalTxInReference proposalRedeemerValue registerPoolCertificate registerStakeCertificate delegateStakeCertificate deregisterStakeCertificate retirePoolCertificate drepRegistrationCertificate drepDeregistrationCertificate drepUpdateCertificate voteDelegationCertificate certificateScript certificateTxInReference certificateRedeemerValue changeAddress invalidBefore invalidHereafter metadataValue metadataScript signingKey selectUtxosFrom protocolParams setFee setTotalCollateral setCollateralReturnAddress setDonation setNetwork setCostModels chainTx inputForEvaluation".split(
        " ",
      ),
      // building
      "complete",
      "completeSync",
      "completeUnbalanced",
      "completeUnbalancedSync",
      "completeSigning",
      "submitTx",
      "reset",
      "removeDuplicateInputs",
      "removeDuplicateRefInputs",
      "emptyTxBuilderBody",
      "queueAllLastItem",
      // the queries
      "calculateMinLovelaceForOutput",
      "calculateFee",
      "getActualFee",
      "calculateFeeForSerializedTx",
      "calculateRefScriptFee",
      "calculateRedeemersFee",
      "getTotalExecutionUnits",
      "getSerializedSize",
      "serializeMockTx",
      // fields
      "meshTxBuilderBody",
      "txHex",
      "fetcher",
      "submitter",
      "evaluator",
      "serializer",
      "selector",
      "verbose",
      "network",
      "txEvaluationMultiplier",
    ];
    for (const name of kept) expect(name in builder).toBe(true);
    const removed = [
      "selectUtxos",
      "updateByTxPrototype",
      "getUtxosForSelection",
      "completeCostModels",
      "evaluateRedeemers",
      "sortTxParts",
      "sortInputs",
      "sortMints",
      "sortWithdrawals",
      "sortVotes",
      "sortProposals",
      // protected ones of the old assembly
      "queriedUTxOs",
      "completeTxParts",
      "settleFeeAndChange",
      "collectAllRequiredSignatures",
      "clone",
      "updateRedeemer",
      "_cloneCore",
    ];
    for (const name of removed) expect(name in builder).toBe(false);
  });
});

describe.each(["scalus", "cquisitor"] as const)(
  "MeshTxBuilder on TxBuilder, on TxEmulator (%s)",
  (validator) => {
    beforeEach(() => resetWarnings());

    it("describes the built transaction in the body, and signs it with completeSigning", async () => {
      const context = await setup(validator);
      const { emulator, locked } = context;
      const payment =
        "f083e5878c6f980c53d30b9cc2baadd780307b08acec9e0792892e013bbe9241";
      const cli = new MeshWallet({
        networkId: 0,
        key: { type: "cli", payment },
      });
      await cli.init();
      const address = (await cli.getChangeAddress())!;
      const funds = emulator.fund(address, { lovelace: 100_000_000n });

      const builder = new MeshTxBuilder({ fetcher: emulator });
      const txHex = await unlock(builder, locked)
        .txOut(address, lovelace(50_000_000))
        .changeAddress(address)
        .selectUtxosFrom([funds])
        .signingKey(payment)
        .complete();

      const tx = parse(txHex);
      const body = builder.meshTxBuilderBody;
      expect(builder.txHex).toBe(txHex);
      expect(
        body.inputs.map((i) => `${i.txIn.txHash}#${i.txIn.txIndex}`),
      ).toEqual(
        tx
          .body()
          .inputs()
          .values()
          .map((i) => `${i.transactionId()}#${i.index()}`),
      );
      // The selected wallet UTxO is among them, described in full
      expect(body.inputs).toContainEqual(
        expect.objectContaining({
          type: "PubKey",
          txIn: expect.objectContaining({
            txHash: funds.input.txHash,
            amount: funds.output.amount,
            address,
          }),
        }),
      );
      // The change follows the outputs given
      expect(body.outputs.map((o) => o.address)).toEqual(
        tx
          .body()
          .outputs()
          .map((o) => o.address().toBech32()),
      );
      expect(body.outputs.length).toBeGreaterThan(1);
      expect(body.fee).toBe(tx.body().fee().toString());
      const input = body.inputs.find((i) => i.type === "Script")!;
      expect(
        input.type === "Script" && input.scriptTxIn.redeemer!.exUnits,
      ).toEqual(unitsOf(txHex)[0]);
      expect(body.expectedNumberKeyWitnesses).toBe(1);

      const signed = builder.completeSigning();
      expect(builder.txHex).toBe(signed);
      expect(await emulator.submit(signed)).toMatchObject({ accepted: true });
    });

    it("submits through the submitter and clears the shared cache's volatile answers", async () => {
      const context = await setup(validator);
      const { emulator, wallet, address, funds } = context;
      // The clock stands still: an answer cannot expire on its own during the test
      const now = Date.now();
      const clock = jest.spyOn(Date, "now").mockReturnValue(now);
      try {
        const cache = CachedFetcher.wrap(emulator);
        const clearVolatile = jest.spyOn(cache, "clearVolatile");
        const fetchAddressUTxOs = jest.spyOn(emulator, "fetchAddressUTxOs");
        await cache.fetchAddressUTxOs(address);
        await cache.fetchAddressUTxOs(address);
        expect(fetchAddressUTxOs).toHaveBeenCalledTimes(1);

        const builder = new MeshTxBuilder({
          fetcher: emulator,
          submitter: emulator,
        });
        const txHex = await builder
          .txOut(address, lovelace(5_000_000))
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        expect(clearVolatile).not.toHaveBeenCalled();
        const txHash = await builder.submitTx(await wallet.signTx(txHex));
        expect(txHash).toBe(parse(txHex).getId().toString());
        expect(clearVolatile).toHaveBeenCalledTimes(1);

        await cache.fetchAddressUTxOs(address);
        expect(fetchAddressUTxOs).toHaveBeenCalledTimes(2);
      } finally {
        clock.mockRestore();
      }
    });

    it("refuses to build without a change address: MISSING_PAYER", async () => {
      const { emulator, address, funds } = await setup(validator);
      await expect(
        new MeshTxBuilder({ fetcher: emulator })
          .txOut(address, lovelace(5_000_000))
          .selectUtxosFrom([funds])
          .complete(),
      ).rejects.toMatchObject({ code: "MISSING_PAYER" });
    });

    it("takes TxEmulator for a local evaluator: a script input it gets by declared data alone is refused without a fetcher, and read with one", async () => {
      const context = await setup(validator);
      const { emulator, address, funds, locked } = context;
      expect(emulator.acceptsKnownUtxos).toBe(true);
      const spend = (builder: MeshTxBuilder) =>
        builder
          .spendingPlutusScriptV3()
          .txIn(
            locked.input.txHash,
            locked.input.outputIndex,
            locked.output.amount,
            locked.output.address,
            0,
          )
          .txInInlineDatumPresent()
          .txInRedeemerValue(mConStr0([]))
          .txInScript(alwaysSucceedCbor)
          .txOut(address, lovelace(5_000_000))
          .txInCollateral(
            funds.input.txHash,
            funds.input.outputIndex,
            funds.output.amount,
            funds.output.address,
          )
          .changeAddress(address)
          .selectUtxosFrom([funds]);
      // The evaluator is handed the build's UTxOs, so the declared data cannot pose as the
      // locked output: without a fetcher the output stays by out ref
      const params = await emulator.fetchProtocolParameters();
      await expect(
        spend(new MeshTxBuilder({ evaluator: emulator, params })).complete(),
      ).rejects.toMatchObject({ code: "MISSING_FETCHER", part: "spend" });
      // Read through a fetcher, the output is known whole and the transaction is accepted
      const txHex = await spend(
        new MeshTxBuilder({ fetcher: emulator, evaluator: emulator }),
      ).complete();
      await accept(context, txHex);
    });

    describe("network", () => {
      it("takes the fetcher's network over a setNetwork() string, and configures the evaluator with it", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const { evaluator, configure } = recordingEvaluator(emulator);
        const fetcher = stating(emulator, "preview");
        const txHex = await unlock(
          new MeshTxBuilder({ fetcher, evaluator }).setNetwork("preprod"),
          locked,
        )
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();

        expect(configure).toHaveBeenCalled();
        for (const [context] of configure.mock.calls) {
          expect(context).toEqual({
            network: "preview",
            costModels: expect.any(Array),
          });
          expect(context).not.toHaveProperty("slotConfig");
        }
        await accept(context, txHex);

        // The constructor's option is a statement the provider contradicts
        await expect(
          unlock(
            new MeshTxBuilder({ fetcher, evaluator, network: "preprod" }),
            locked,
          )
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete(),
        ).rejects.toMatchObject({ code: "NETWORK_MISMATCH" });
      });

      it("takes the constructor's option over a later setNetwork(), and nothing from a body", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const fetcher = stating(emulator, undefined);
        const first = recordingEvaluator(emulator);
        await unlock(
          new MeshTxBuilder({
            fetcher,
            evaluator: first.evaluator,
            network: "preprod",
          }).setNetwork("preview"),
          locked,
        )
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        expect(first.configure.mock.calls[0]![0].network).toBe("preprod");

        // A body given to complete() states no network
        const second = recordingEvaluator(emulator);
        const builder = new MeshTxBuilder({
          fetcher,
          evaluator: second.evaluator,
        });
        await unlock(builder, locked)
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete({ network: "preprod" });
        expect(second.configure.mock.calls[0]![0].network).toBeUndefined();
      });

      it("takes a setNetwork() string only for the change address's network id", async () => {
        const mainnet = (await (await walletOf(1)).getChangeAddress())!;
        const { address } = await setup(validator);
        const declared = (to: string) =>
          new MeshTxBuilder({ evaluator: null })
            .txIn("c".repeat(64), 0, lovelace(10_000_000), to, 0)
            .txOut(to, lovelace(2_000_000))
            .changeAddress(to);
        // A preprod string with a mainnet address builds on mainnet; a mainnet string with a
        // test address is no statement either
        await expect(
          declared(mainnet).setNetwork("preprod").complete(),
        ).resolves.toMatch(/^[0-9a-f]+$/);
        await expect(
          declared(address).setNetwork("mainnet").complete(),
        ).resolves.toMatch(/^[0-9a-f]+$/);
      });

      it("refuses an address of the other network id: NETWORK_MISMATCH, whatever setNetwork() says", async () => {
        const mainnet = (await (await walletOf(1)).getChangeAddress())!;
        const { emulator, address } = await setup(validator);
        // A mainnet change address under a provider that states preprod; a setNetwork() string
        // that agrees with the address does not outweigh the provider
        const underPreprod = (builder: MeshTxBuilder) =>
          builder
            .txIn("c".repeat(64), 0, lovelace(10_000_000), mainnet, 0)
            .txOut(mainnet, lovelace(2_000_000))
            .changeAddress(mainnet)
            .complete();
        for (const builder of [
          new MeshTxBuilder({ fetcher: emulator }),
          new MeshTxBuilder({ fetcher: emulator }).setNetwork("mainnet"),
        ])
          await expect(underPreprod(builder)).rejects.toMatchObject({
            code: "NETWORK_MISMATCH",
          });

        // Outputs to a mainnet and a test address in one transaction, nothing stated
        const mixed = (builder: MeshTxBuilder) =>
          builder
            .txIn("c".repeat(64), 0, lovelace(10_000_000), address, 0)
            .txOut(mainnet, lovelace(2_000_000))
            .txOut(address, lovelace(2_000_000))
            .changeAddress(address)
            .complete();
        for (const builder of [
          new MeshTxBuilder({ evaluator: null }),
          new MeshTxBuilder({ evaluator: null }).setNetwork("preprod"),
          new MeshTxBuilder({ evaluator: null }).setNetwork("mainnet"),
        ])
          await expect(mixed(builder)).rejects.toMatchObject({
            code: "NETWORK_MISMATCH",
          });

        // The same transaction with both outputs on the test network builds
        await expect(
          new MeshTxBuilder({ evaluator: null })
            .txIn("c".repeat(64), 0, lovelace(10_000_000), address, 0)
            .txOut(address, lovelace(2_000_000))
            .txOut(address, lovelace(2_000_000))
            .changeAddress(address)
            .complete(),
        ).resolves.toMatch(/^[0-9a-f]+$/);
      });

      it("is not known for a test address nobody named: no validity interval for the default evaluator", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const fetcher = stating(emulator, undefined);
        const build = (builder: MeshTxBuilder, invalidHereafter?: number) => {
          unlock(builder, locked)
            .changeAddress(address)
            .selectUtxosFrom([funds]);
          if (invalidHereafter !== undefined)
            builder.invalidHereafter(invalidHereafter);
          return builder.complete();
        };

        const txHex = await build(new MeshTxBuilder({ fetcher }));
        expect(unitsOf(txHex)[0]!.mem).toBeGreaterThan(0);

        const refused = await build(
          new MeshTxBuilder({ fetcher }),
          100_001_000,
        ).catch((error: unknown) => error);
        expect(refused).toMatchObject({ code: "EVALUATION_FAILED" });
        expect((refused as Error).cause).toBeDefined();

        // An evaluator that needs no clock is not affected
        const plain: IEvaluator = {
          evaluateTx: (tx, utxos, txs) => emulator.evaluateTx(tx, utxos, txs),
        };
        await expect(
          build(new MeshTxBuilder({ fetcher, evaluator: plain }), 100_001_000),
        ).resolves.toMatch(/^[0-9a-f]+$/);

        await accept(context, txHex);
      });
    });

    it("keeps the units of the call without an evaluator", async () => {
      const context = await setup(validator);
      const { emulator, address, funds, locked } = context;
      const txHex = await unlock(
        new MeshTxBuilder({ fetcher: emulator, evaluator: null }),
        locked,
        enoughUnits,
      )
        .changeAddress(address)
        .selectUtxosFrom([funds])
        .complete();
      expect(unitsOf(txHex)).toEqual([enoughUnits]);
      await accept(context, txHex);

      // Without a fetcher no evaluator is made either
      const offline = new MeshTxBuilder();
      const declaredTx = await offline
        .spendingPlutusScriptV3()
        .txIn(
          locked.input.txHash,
          0,
          locked.output.amount,
          locked.output.address,
          0,
        )
        .txInInlineDatumPresent()
        .txInRedeemerValue(mConStr0([]), "Mesh", enoughUnits)
        .txInScript(alwaysSucceedCbor)
        .changeAddress(address)
        .selectUtxosFrom([funds])
        .complete();
      expect(unitsOf(declaredTx)).toEqual([enoughUnits]);
    });

    describe("protocol parameters", () => {
      it("reads them from the fetcher, with the consumer's fields over them in call order", async () => {
        const context = await setup(validator, { params: { minFeeA: 50 } });
        const { emulator, wallet, address, funds } = context;
        const builder = new MeshTxBuilder({
          fetcher: emulator,
          params: { minFeeB: 1 },
        })
          .protocolParams({ minFeeA: 60 })
          .protocolParams({ maxTxSize: 20000 });
        const txHex = await builder
          .txOut(address, lovelace(5_000_000))
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        const signed = await wallet.signTx(txHex);
        expect(parse(txHex).body().fee()).toBe(
          60n * BigInt(signed.length / 2) + 1n,
        );
        expect(protocolOf(builder)).toMatchObject({
          minFeeA: 60,
          minFeeB: 1,
          maxTxSize: 20000,
        });

        const hydra = await new MeshTxBuilder({
          fetcher: emulator,
          isHydra: true,
        })
          .protocolParams({ minFeeA: 44 })
          .txOut(address, lovelace(5_000_000))
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        expect(parse(hydra).body().fee()).toBe(0n);
      });

      it("builds up to the network's maxTxExMem, and refuses ex units beyond it", async () => {
        const context = await setup(validator, {
          params: { maxTxExMem: "16500000" },
        });
        const { emulator, address, funds, locked } = context;
        const spendWith = (mem: number, options: MeshTxBuilderOptions) =>
          unlock(new MeshTxBuilder({ evaluator: null, ...options }), locked, {
            mem,
            steps: 100_000_000,
          })
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();

        await expect(
          spendWith(16_200_000, { fetcher: emulator }),
        ).resolves.toMatch(/^[0-9a-f]+$/);
        await expect(
          spendWith(16_600_000, { fetcher: emulator }),
        ).rejects.toMatchObject({ code: "EXUNITS_EXCEEDED" });

        // The consumer's field over the fetched ones is used
        const base = await spendWith(16_200_000, { fetcher: emulator });
        const higher = await spendWith(16_200_000, {
          fetcher: emulator,
          params: { minFeeA: 50 },
        });
        expect(parse(higher).body().fee()).toBeGreaterThan(
          parse(base).body().fee(),
        );

        // Without a fetcher, on the built-in parameters
        const offline = (mem: number) =>
          new MeshTxBuilder({ evaluator: null })
            .spendingPlutusScriptV3()
            .txIn(
              locked.input.txHash,
              0,
              locked.output.amount,
              locked.output.address,
              0,
            )
            .txInInlineDatumPresent()
            .txInRedeemerValue(mConStr0([]), "Mesh", {
              mem,
              steps: 100_000_000,
            })
            .txInScript(alwaysSucceedCbor)
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
        await expect(offline(16_200_000)).resolves.toMatch(/^[0-9a-f]+$/);
        const exceeded = await offline(16_600_000).catch((e: unknown) => e);
        expect(exceeded).toMatchObject({ code: "EXUNITS_EXCEEDED" });
        expect((exceeded as Error).message).toContain("16500000");
      });

      it("falls back to the built-in parameters with one warning, and the sync methods to those read", async () => {
        const context = await setup(validator, { params: { minFeeA: 50 } });
        const { emulator, address, funds } = context;
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        try {
          const payment = (builder: MeshTxBuilder) =>
            builder
              .txIn(
                funds.input.txHash,
                0,
                funds.output.amount,
                funds.output.address,
                0,
              )
              .txOut(address, lovelace(5_000_000))
              .changeAddress(address);
          // The sync methods build on the built-in parameters without a warning
          payment(new MeshTxBuilder()).completeSync();
          expect(warn).not.toHaveBeenCalled();
          for (let i = 0; i < 2; i++)
            await payment(new MeshTxBuilder()).complete();
          expect(warn).toHaveBeenCalledTimes(1);
          expect(String(warn.mock.calls[0]![0])).toMatch(/fetcher|params/);

          // What the builder read stays its parameters afterwards
          const reader = new MeshTxBuilder({ fetcher: emulator });
          await payment(reader).complete();
          expect(reader.calculateFeeForSerializedTx(100)).toBe(
            50n * 100n +
              BigInt((await emulator.fetchProtocolParameters()).minFeeB),
          );
          expect(warn).toHaveBeenCalledTimes(1);
        } finally {
          warn.mockRestore();
        }
      });

      it("falls back to the built-in parameters when the fetcher throws or answers nothing", async () => {
        for (const answer of [
          () => Promise.reject(new Error("unavailable")),
          () => Promise.resolve(undefined),
          // An answer without a single field is no answer
          () => Promise.resolve({}),
          () => Promise.resolve({ minFeeA: undefined }),
        ]) {
          resetWarnings();
          const context = await setup(validator, { params: { minFeeA: 50 } });
          const { emulator, address, funds } = context;
          const fetcher = new Proxy(emulator, {
            get: (target, prop) =>
              prop === "fetchProtocolParameters"
                ? answer
                : Reflect.get(target, prop, target),
          }) as unknown as IFetcher;
          const fee = async (options: MeshTxBuilderOptions) => {
            const builder = new MeshTxBuilder(options);
            const txHex = await builder
              .txOut(address, lovelace(5_000_000))
              .changeAddress(address)
              .selectUtxosFrom([funds])
              .complete();
            return { builder, fee: parse(txHex).body().fee() };
          };
          const builtin = (
            await fee({
              fetcher: emulator,
              params: DEFAULT_PROTOCOL_PARAMETERS,
            })
          ).fee;
          expect((await fee({ fetcher: emulator })).fee).not.toBe(builtin);
          const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
          try {
            for (let i = 0; i < 2; i++) {
              const built = await fee({ fetcher });
              expect(protocolOf(built.builder)).toEqual(
                DEFAULT_PROTOCOL_PARAMETERS,
              );
              expect(built.fee).toBe(builtin);
            }
            expect(warn).toHaveBeenCalledTimes(1);
            expect(String(warn.mock.calls[0]![0])).toMatch(/fetcher|params/);
          } finally {
            warn.mockRestore();
          }
        }
      });

      it("keeps the parameters an earlier complete() read when a later read fails or is empty", async () => {
        for (const later of [
          () => Promise.reject(new Error("unavailable")),
          () => Promise.resolve({}),
        ]) {
          resetWarnings();
          const context = await setup(validator, { params: { minFeeA: 50 } });
          const { emulator, address, funds } = context;
          let failing = false;
          const fetcher = new Proxy(emulator, {
            get: (target, prop) =>
              prop === "fetchProtocolParameters"
                ? (epoch: number) =>
                    failing ? later() : target.fetchProtocolParameters(epoch)
                : Reflect.get(target, prop, target),
          }) as unknown as IFetcher;
          const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
          try {
            const builder = new MeshTxBuilder({ fetcher });
            const payment = () =>
              builder
                .txOut(address, lovelace(5_000_000))
                .changeAddress(address)
                .selectUtxosFrom([funds])
                .complete();
            const first = await payment();
            expect(protocolOf(builder).minFeeA).toBe(50);

            // The next read gives nothing, and is not served by the cache
            failing = true;
            CachedFetcher.wrap(fetcher).clear();
            builder.reset();
            expect(await payment()).toBe(first);
            expect(protocolOf(builder).minFeeA).toBe(50);
            expect(warn).not.toHaveBeenCalled();
          } finally {
            warn.mockRestore();
          }
        }
      });
      it("warns of the built-in parameters only when the consumer's fields leave one in use", async () => {
        const context = await setup(validator);
        const { emulator, address, funds } = context;
        const params = await emulator.fetchProtocolParameters();
        const payment = (builder: MeshTxBuilder) =>
          builder
            .txIn(...utxoToTxIn(funds))
            .txOut(address, lovelace(5_000_000))
            .changeAddress(address)
            .complete();
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        try {
          // Every field given, with no fetcher: nothing built in is used
          const whole = await payment(new MeshTxBuilder({ params }));
          await payment(new MeshTxBuilder().protocolParams(params));
          expect(warn).not.toHaveBeenCalled();
          await accept(context, whole);

          await payment(new MeshTxBuilder({ params: { minFeeA: 50 } }));
          expect(warn).toHaveBeenCalledTimes(1);
          expect(String(warn.mock.calls[0]![0])).toMatch(/fetcher|params/);
        } finally {
          warn.mockRestore();
        }
      });

      it("takes a field the fetcher gives as undefined from the built-in parameters", async () => {
        const context = await setup(validator);
        const { emulator, address, funds } = context;
        const fetcher = new Proxy(emulator, {
          get: (target, prop) =>
            prop === "fetchProtocolParameters"
              ? async (epoch: number) => ({
                  ...(await target.fetchProtocolParameters(epoch)),
                  minFeeRefScriptCostPerByte: undefined,
                  priceMem: undefined,
                })
              : Reflect.get(target, prop, target),
        }) as unknown as IFetcher;
        const builder = new MeshTxBuilder({ fetcher });
        const txHex = await builder
          .txOut(address, lovelace(5_000_000))
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        expect(protocolOf(builder)).toMatchObject({
          minFeeRefScriptCostPerByte:
            DEFAULT_PROTOCOL_PARAMETERS.minFeeRefScriptCostPerByte,
          priceMem: DEFAULT_PROTOCOL_PARAMETERS.priceMem,
        });
        await accept(context, txHex);
      });
    });

    describe("cost models", () => {
      it("falls back to the built-in models when fetchCostModels throws or answers nothing", async () => {
        for (const answer of [
          () => Promise.reject(new Error("unavailable")),
          () => Promise.resolve([]),
        ]) {
          const context = await setup(validator, {
            costModels: DEFAULT_COST_MODELS,
          });
          const { emulator, address, funds, locked } = context;
          const fetcher = new Proxy(emulator, {
            get: (target, prop) =>
              prop === "fetchCostModels"
                ? answer
                : Reflect.get(target, prop, target),
          }) as unknown as IFetcher;
          const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
          try {
            const builder = new MeshTxBuilder({ fetcher });
            const txHex = await unlock(builder, locked)
              .changeAddress(address)
              .selectUtxosFrom([funds])
              .complete();
            expect(builder.meshTxBuilderBody.network).toEqual(
              DEFAULT_COST_MODELS,
            );
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn).toHaveBeenCalledWith(
              expect.stringMatching(/cost models/i),
              expect.anything(),
            );
            await accept(context, txHex);
          } finally {
            warn.mockRestore();
          }
        }
      });

      it("fills a version the provider leaves empty from the built-in list, and reads none without Plutus", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const [, v2, v3] = await emulator.fetchCostModels();
        const fetchCostModels = jest.fn(async () => [[], v2!, v3!]);
        const fetcher = new Proxy(emulator, {
          get: (target, prop) =>
            prop === "fetchCostModels"
              ? fetchCostModels
              : Reflect.get(target, prop, target),
        }) as unknown as IFetcher;

        const payment = new MeshTxBuilder({ fetcher });
        await payment
          .txOut(address, lovelace(5_000_000))
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        expect(fetchCostModels).not.toHaveBeenCalled();
        expect(payment.meshTxBuilderBody.network).toBe("mainnet");

        const builder = new MeshTxBuilder({ fetcher });
        await unlock(builder, locked)
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        expect(fetchCostModels).toHaveBeenCalled();
        expect(builder.meshTxBuilderBody.network).toEqual([
          DEFAULT_V1_COST_MODEL_LIST,
          v2,
          v3,
        ]);
      });
    });

    it("isHydra: no fee, collateral put up, outputs at no minimum, and the reference-script fee kept", async () => {
      const head = {
        minFeeA: 0,
        minFeeB: 0,
        priceMem: 0,
        priceStep: 0,
        coinsPerUtxoSize: 0,
      };
      const context = await setup(validator, { params: head });
      const { emulator, address, funds, locked, holder } = context;
      const hydra = () =>
        new MeshTxBuilder({ fetcher: emulator, isHydra: true });

      const payment = await hydra()
        .txOut(address, lovelace(5_000_000))
        .txOut(address, [])
        .changeAddress(address)
        .selectUtxosFrom([funds])
        .complete();
      expect(parse(payment).body().fee()).toBe(0n);
      expect(parse(payment).body().outputs()[1]!.amount().coin()).toBe(0n);
      await accept(context, payment);

      const spend = await unlock(hydra(), locked)
        .changeAddress(address)
        .selectUtxosFrom(await emulator.fetchAddressUTxOs(address))
        .complete();
      const body = parse(spend).body();
      expect(body.collateral()?.size()).toBe(1);
      expect(body.totalCollateral()).toBe(0n);
      await accept(context, spend);

      // A UTxO holding a reference script is still priced for it
      const withRef = await hydra()
        .txIn(...utxoToTxIn(holder))
        .changeAddress(address)
        .complete();
      expect(parse(withRef).body().fee()).toBeGreaterThan(0n);
      await accept(context, withRef);
    });

    it("encodes with the builder's encoder whatever the serializer: CSL fields it lost are there", async () => {
      const context = await setup(validator);
      const { emulator, wallet, address, funds, locked } = context;
      const [rewardAddress] = await wallet.getRewardAddresses();
      emulator.setAccount({ rewardAddress: rewardAddress! });
      const serializer = new CSLSerializer();
      const collateral = emulator.fund(address, { lovelace: 10_000_000n });
      const build = (scriptInMetadata: boolean) => {
        const builder = new MeshTxBuilder({ fetcher: emulator, serializer });
        unlock(builder, locked)
          .txInCollateral(
            collateral.input.txHash,
            0,
            collateral.output.amount,
            address,
          )
          .setTotalCollateral("5000000")
          .setCollateralReturnAddress(scriptAddress)
          .proposal(
            { kind: "InfoAction", action: {} },
            {
              anchorUrl: "https://example.com/proposal.json",
              anchorDataHash: "0".repeat(64),
            },
            rewardAddress!,
            // The emulated preprod's governance action deposit
            "1000000000",
          )
          .metadataValue(1, 42)
          .setDonation("1000000")
          .changeAddress(address);
        if (scriptInMetadata)
          builder.metadataScript(alwaysSucceedCbor, "PlutusV3");
        return { builder, complete: () => builder.complete() };
      };
      const utxos = await emulator.fetchAddressUTxOs(address);
      const { builder, complete } = build(true);
      builder.selectUtxosFrom(utxos);
      const txHex = await complete();

      expect(builder.serializer).toBe(serializer);
      const tx = parse(txHex);
      expect(tx.body().proposalProcedures()?.size()).toBe(1);
      expect(tx.body().totalCollateral()).toBe(5_000_000n);
      expect(tx.body().collateralReturn()?.address().toBech32()).toBe(
        scriptAddress,
      );
      expect(tx.body().donation()).toBe(1_000_000n);
      expect(tx.witnessSet().plutusV3Scripts()?.size()).toBe(1);
      expect(tx.auxiliaryData()?.plutusV3Scripts()?.length).toBe(1);
      expect(tx.auxiliaryData()?.metadata()?.metadata()?.get(1n)).toBeDefined();
      if (validator === "scalus") {
        await accept(context, txHex);
        return;
      }
      // cquisitor encodes auxiliary data holding a Plutus script again before hashing it, and so
      // refuses every such transaction; the body states the hash of the bytes, as Scalus checks.
      // The rest it accepts.
      const plain = build(false);
      plain.builder.selectUtxosFrom(utxos);
      await accept(context, await plain.complete());
    });

    it("spends an output of a chained transaction the fetcher does not know yet", async () => {
      const context = await setup(validator);
      const { emulator, wallet, address } = context;
      const [parentFunds, childFunds] = [
        emulator.fund(address, { lovelace: 100_000_000n }),
        emulator.fund(address, { lovelace: 100_000_000n }),
      ];
      const parent = await wallet.signTx(
        await new MeshTxBuilder({ fetcher: emulator })
          .txOut(scriptAddress, lovelace(20_000_000))
          .txOutInlineDatumValue(mConStr0([]))
          .changeAddress(address)
          .selectUtxosFrom([parentFunds!])
          .complete(),
      );
      const parentHash = parse(parent).getId().toString();
      const child = await new MeshTxBuilder({ fetcher: emulator })
        .spendingPlutusScriptV3()
        .txIn(parentHash, 0)
        .txInInlineDatumPresent()
        .txInRedeemerValue(mConStr0([]))
        .txInScript(alwaysSucceedCbor)
        .chainTx(parent)
        .changeAddress(address)
        .selectUtxosFrom([childFunds!])
        .complete();
      expect(unitsOf(child)[0]!.mem).toBeGreaterThan(0);
      expect(await emulator.submit(parent)).toMatchObject({ accepted: true });
      await accept(context, child);
    });

    it("evaluates with a UTxO given by inputForEvaluation that the fetcher does not know", async () => {
      const context = await setup(validator);
      const { emulator, address, funds } = context;
      const unknown = utxoAt("7".repeat(64), scriptAddress, 20_000_000n, {
        plutusData: "d87980",
      });
      const txHex = await unlock(
        new MeshTxBuilder({ fetcher: emulator }).inputForEvaluation(unknown),
        unknown,
      )
        .changeAddress(address)
        .selectUtxosFrom([funds])
        .complete();
      expect(unitsOf(txHex)).toEqual(
        (await emulator.evaluateTx(txHex, [unknown])).map((a) => a.budget),
      );
    });

    describe("translation of the body", () => {
      it("merges exact repeats, refuses contradictory ones, and drops a reference to a spent out ref", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const repeated = await new MeshTxBuilder({ fetcher: emulator })
          .txIn(...utxoToTxIn(funds))
          .txIn(...utxoToTxIn(funds))
          .readOnlyTxInReference(funds.input.txHash, 0)
          .txOut(address, lovelace(5_000_000))
          .changeAddress(address)
          .complete();
        const body = parse(repeated).body();
        expect(body.inputs().size()).toBe(1);
        expect(body.referenceInputs()).toBeUndefined();
        await accept(context, repeated);

        const contradictory = unlock(
          new MeshTxBuilder({ fetcher: emulator }),
          locked,
        )
          .spendingPlutusScriptV3()
          .txIn(locked.input.txHash, 0)
          .txInInlineDatumPresent()
          .txInRedeemerValue(mConStr0([1]))
          .txInScript(alwaysSucceedCbor)
          .changeAddress(address)
          .selectUtxosFrom([funds]);
        await expect(contradictory.complete()).rejects.toMatchObject({
          code: "DUPLICATE_PART",
        });

        // The public method keeps the first of two inputs, whatever they hold
        const kept = new MeshTxBuilder()
          .txIn(funds.input.txHash, 0, lovelace(1), address, 0)
          .txIn(funds.input.txHash, 0, lovelace(2), address, 0)
          .txIn("c".repeat(64), 0);
        kept.removeDuplicateInputs();
        expect(kept.meshTxBuilderBody.inputs).toHaveLength(1);
        expect(kept.meshTxBuilderBody.inputs[0]!.txIn.amount).toEqual(
          lovelace(1),
        );
      });

      it("merges an exact repeat of a withdrawal", async () => {
        const { address } = await setup(validator);
        const wallet = await walletOf();
        const [rewardAddress] = await wallet.getRewardAddresses();
        const txHex = await new MeshTxBuilder({ evaluator: null })
          .txIn("c".repeat(64), 0, lovelace(10_000_000), address, 0)
          .withdrawal(rewardAddress!, "0")
          .withdrawal(rewardAddress!, "0")
          .changeAddress(address)
          .complete();
        expect(parse(txHex).body().withdrawals()?.size).toBe(1);
      });

      it("takes the pool deposit for a pool registration, and no lower bound for slot 0", async () => {
        const { address } = await setup(validator);
        const wallet = await walletOf();
        const [rewardAddress] = await wallet.getRewardAddresses();
        const txHex = await new MeshTxBuilder({ evaluator: null })
          .txIn("c".repeat(64), 0, lovelace(1_000_000_000), address, 0)
          .registerPoolCertificate({
            vrfKeyHash: "11".repeat(32),
            operator: "22".repeat(28),
            pledge: "0",
            cost: "340000000",
            margin: [1, 100],
            relays: [],
            owners: ["22".repeat(28)],
            rewardAddress: rewardAddress!,
          })
          .invalidBefore(0)
          .changeAddress(address)
          .complete();
        const body = parse(txHex).body();
        const out = body
          .outputs()
          .reduce((sum, o) => sum + o.amount().coin(), 0n);
        expect(1_000_000_000n - out - body.fee()).toBe(
          BigInt(DEFAULT_PROTOCOL_PARAMETERS.poolDeposit),
        );
        expect(body.validityStartInterval()).toBeUndefined();
      });

      it("spends a V3 script output without a datum, the inline-datum mark given", async () => {
        const context = await setup(validator);
        const { emulator, address, funds } = context;
        const bare = utxoAt("8".repeat(64), scriptAddress, 20_000_000n);
        emulator.addUtxos([bare]);
        const txHex = await unlock(
          new MeshTxBuilder({ fetcher: emulator }),
          bare,
        )
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        await accept(context, txHex);
      });

      it("takes a reference script's data over the hash and size the call declares", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked, holder } = context;
        const txHex = await new MeshTxBuilder({ fetcher: emulator })
          .spendingPlutusScriptV3()
          .txIn(locked.input.txHash, 0)
          .txInInlineDatumPresent()
          .txInRedeemerValue(mConStr0([]))
          .spendingTxInReference(holder.input.txHash, 0, "999", "ab".repeat(28))
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        await accept(context, txHex);
      });

      it("takes the datum a declared Plutus input names, and checks its lock", async () => {
        const { address, funds, locked } = await setup(validator);
        const declared = (at: string) =>
          new MeshTxBuilder()
            .spendingPlutusScriptV3()
            .txIn(locked.input.txHash, 0, locked.output.amount, at, 0)
            .txInInlineDatumPresent()
            .txInRedeemerValue(mConStr0([]), "Mesh", enoughUnits)
            .txInScript(alwaysSucceedCbor)
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
        await expect(declared(scriptAddress)).resolves.toMatch(/^[0-9a-f]+$/);
        await expect(declared(address)).rejects.toMatchObject({
          code: "WITNESS_MISMATCH",
        });
      });
      it("builds a body copied through JSON, its metadata then no Map, without metadata as before", async () => {
        const context = await setup(validator);
        const { emulator, address, funds } = context;
        const body: MeshTxBuilderBody = {
          ...emptyTxBuilderBody(),
          inputs: [
            {
              type: "PubKey",
              txIn: {
                txHash: funds.input.txHash,
                txIndex: funds.input.outputIndex,
                amount: funds.output.amount,
                address,
              },
            },
          ],
          outputs: [{ address, amount: lovelace(5_000_000) }],
          changeAddress: address,
        };
        const copy = () => JSON.parse(JSON.stringify(body));
        expect(copy().metadata).toEqual({});
        const built = [
          await new MeshTxBuilder({ fetcher: emulator }).complete(copy()),
          new MeshTxBuilder().completeSync(copy()),
          new MeshTxBuilder().completeUnbalanced(copy()),
        ];
        for (const txHex of built)
          expect(parse(txHex).auxiliaryData()).toBeUndefined();
        await accept(context, built[0]!);
      });

      it("keeps the one price a parameter change gives, the other then 0", async () => {
        const context = await setup(validator);
        const { emulator, address, wallet } = context;
        const [rewardAddress] = await wallet.getRewardAddresses();
        emulator.setAccount({ rewardAddress: rewardAddress! });
        // The preprod guardrail rejects zero prices. Isolate partial-price
        // encoding while still validating the transaction with the emulator.
        emulator.setConstitution({
          anchor: {
            anchorUrl: "https://example.com/constitution.json",
            anchorDataHash: "ab".repeat(32),
          },
        });
        // The emulated network's govActionDeposit
        const deposit = 1_000_000_000n;
        const memPrice = { numerator: "577", denominator: "10000" };
        const stepPrice = { numerator: "721", denominator: "10000000" };
        const cases = [
          [{ executionCosts: { memPrice } }, { memory: 577 / 10000, steps: 0 }],
          [{ executionCosts: { stepPrice } }, { memory: 0, steps: 721 / 1e7 }],
          [
            { maxTxSize: 16384, executionCosts: { memPrice } },
            { memory: 577 / 10000, steps: 0 },
          ],
        ] as const;
        for (const [protocolParamUpdates, prices] of cases) {
          const funds = emulator.fund(address, {
            lovelace: deposit + 100_000_000n,
          });
          const txHex = await new MeshTxBuilder({ fetcher: emulator })
            .proposal(
              {
                kind: "ParameterChangeAction",
                action: { protocolParamUpdates },
              },
              {
                anchorUrl: "https://example.com/p.json",
                anchorDataHash: "cd".repeat(32),
              },
              rewardAddress!,
              String(deposit),
            )
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
          const action = parse(txHex).body().toCore().proposalProcedures![0]!
            .governanceAction as unknown as {
            protocolParamUpdate: { prices?: unknown; maxTxSize?: number };
          };
          expect(action.protocolParamUpdate.prices).toEqual(prices);
          if ("maxTxSize" in protocolParamUpdates)
            expect(action.protocolParamUpdate.maxTxSize).toBe(16384);
          await accept(context, txHex);
        }
      });
    });

    describe("where output data comes from", () => {
      it("reads an input given with amount and address, and prices the reference script it holds", async () => {
        const context = await setup(validator);
        const { emulator, address, holder } = context;
        const fetchUTxOs = jest.spyOn(emulator, "fetchUTxOs");
        // The copy the call declares from holds no script
        const declared: UTxO = {
          input: holder.input,
          output: { address, amount: holder.output.amount },
        };
        const txHex = await new MeshTxBuilder({ fetcher: emulator })
          .txIn(...utxoToTxIn(declared))
          .txOut(address, lovelace(5_000_000))
          .changeAddress(address)
          .complete();
        expect(
          fetchUTxOs.mock.calls.filter(
            ([hash]) => hash === holder.input.txHash,
          ),
        ).toHaveLength(1);
        // The ledger checks the reference-script fee
        await accept(context, txHex);
      });

      it("builds a declared key input the provider does not have, under the default evaluator too", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const notFound = JSON.stringify(
          JSON.stringify({ data: { status_code: 404 }, status: 404 }),
        );
        for (const fetcher of [
          emulator as IFetcher,
          failingFor(emulator, "c".repeat(64), notFound),
        ]) {
          const txHex = await unlock(new MeshTxBuilder({ fetcher }), locked)
            .txIn("c".repeat(64), 0, lovelace(5_000_000), address, 0)
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
          expect(parse(txHex).body().inputs().size()).toBeGreaterThan(1);
        }
      });

      it("refuses declared data in front of the default evaluator for a script input and a possible reference script", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const declaredScriptInput = (evaluator?: null) =>
          unlock(
            new MeshTxBuilder({ fetcher: emulator, evaluator }),
            locked,
            enoughUnits,
          )
            .spendingPlutusScriptV3()
            .txIn("d".repeat(64), 0, lovelace(5_000_000), scriptAddress, 0)
            .txInInlineDatumPresent()
            .txInRedeemerValue(mConStr0([]), "Mesh", enoughUnits)
            .txInScript(alwaysSucceedCbor)
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
        await expect(declaredScriptInput()).rejects.toMatchObject({
          code: "UTXO_NOT_FOUND",
        });
        await expect(declaredScriptInput(null)).resolves.toMatch(/^[0-9a-f]+$/);

        const sized = (scriptSize: number, evaluator?: null) =>
          unlock(
            new MeshTxBuilder({ fetcher: emulator, evaluator }),
            locked,
            enoughUnits,
          )
            .txIn("c".repeat(64), 0, lovelace(5_000_000), address, scriptSize)
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
        await expect(sized(100)).rejects.toMatchObject({
          code: "UTXO_NOT_FOUND",
        });
        // Without an evaluator the declared size is priced
        const fee = async (scriptSize: number) =>
          parse(await sized(scriptSize, null))
            .body()
            .fee();
        const pricePerByte = BigInt(
          (await emulator.fetchProtocolParameters()).minFeeRefScriptCostPerByte,
        );
        expect((await fee(100)) - (await fee(0))).toBe(100n * pricePerByte);

        // The body keeps the size declared for an input the provider does not have
        const payment = new MeshTxBuilder({
          fetcher: emulator,
          evaluator: null,
        })
          .txIn("c".repeat(64), 0, lovelace(100_000_000), address, 500)
          .txOut(address, lovelace(2_000_000))
          .changeAddress(address);
        await payment.complete();
        expect(payment.meshTxBuilderBody.inputs).toHaveLength(1);
        expect(payment.meshTxBuilderBody.inputs[0]!.txIn.scriptSize).toBe(500);
      });

      it("builds a declared collateral the fetcher fails on, unless the evaluator is handed it", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const serverError = JSON.stringify(
          JSON.stringify({ data: {}, status: 500 }),
        );
        const fetcher = failingFor(emulator, "e".repeat(64), serverError);
        const spend = (evaluator?: null) =>
          unlock(new MeshTxBuilder({ fetcher, evaluator }), locked, enoughUnits)
            .txInCollateral("e".repeat(64), 0, lovelace(10_000_000), address)
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
        await expect(spend(null)).resolves.toMatch(/^[0-9a-f]+$/);
        await expect(spend()).rejects.toMatchObject({
          code: "UTXO_NOT_FOUND",
          cause: serverError,
        });
      });

      it("prices declared reference sizes without a fetcher, and needs a fetcher for what cannot stand", async () => {
        const { address, locked } = await setup(validator);
        const build = (
          readSize: number,
          refSize: string | undefined,
          inputSize?: number,
        ) =>
          new MeshTxBuilder()
            .txIn("c".repeat(64), 0, lovelace(100_000_000), address, inputSize)
            .readOnlyTxInReference("f".repeat(64), 0, readSize)
            .spendingPlutusScriptV3()
            .txIn(
              locked.input.txHash,
              0,
              locked.output.amount,
              scriptAddress,
              0,
            )
            .txInInlineDatumPresent()
            .txInRedeemerValue(mConStr0([]), "Mesh", enoughUnits)
            .spendingTxInReference(
              "9".repeat(64),
              0,
              refSize,
              alwaysSucceedHash,
            )
            .txInCollateral("e".repeat(64), 0, lovelace(100_000_000), address)
            .changeAddress(address)
            .complete();
        const fee = async (readSize: number, refSize: string) =>
          parse(await build(readSize, refSize, 0))
            .body()
            .fee();
        // 3000 declared bytes against 1, at the built-in price
        const price = BigInt(
          DEFAULT_PROTOCOL_PARAMETERS.minFeeRefScriptCostPerByte,
        );
        expect((await fee(1000, "2000")) - (await fee(0, "1"))).toBe(
          2999n * price,
        );
        await expect(build(0, "1")).rejects.toMatchObject({
          code: "MISSING_FETCHER",
        });

        // The body keeps the size declared for an input, which the fee counted
        const priced = (scriptSize: number) =>
          new MeshTxBuilder()
            .txIn("c".repeat(64), 0, lovelace(100_000_000), address, scriptSize)
            .txOut(address, lovelace(2_000_000))
            .changeAddress(address);
        const declared = priced(500);
        const declaredFee = parse(await declared.complete())
          .body()
          .fee();
        expect(declared.meshTxBuilderBody.inputs).toHaveLength(1);
        expect(declared.meshTxBuilderBody.inputs[0]!.txIn.scriptSize).toBe(500);
        expect(declared.meshTxBuilderBody.fee).toBe(declaredFee.toString());
        const unsized = parse(await priced(0).complete())
          .body()
          .fee();
        expect(declaredFee - unsized).toBe(500n * price);
        await expect(build(0, undefined, 0)).rejects.toMatchObject({
          code: "MISSING_FETCHER",
        });
      });

      it("keeps a declared reference script the fetcher does not have, and counts one size per out ref", async () => {
        const { emulator, address, funds } = await setup(validator);
        /** A mint by a reference script the emulator does not hold, and a read-only reference */
        const mintWith = (
          readSize: number,
          scriptSize: number,
          held?: UTxO,
          readHash?: string,
        ) => {
          const builder = new MeshTxBuilder({
            fetcher: emulator,
            evaluator: null,
          });
          if (held) builder.inputForEvaluation(held);
          return builder
            .readOnlyTxInReference(
              held?.input.txHash ?? readHash ?? "9".repeat(64),
              0,
              readSize,
            )
            .mintPlutusScriptV3()
            .mint("1", alwaysSucceedHash, "")
            .mintRedeemerValue(mConStr0([]), "Mesh", enoughUnits)
            .mintTxInReference(
              "9".repeat(64),
              0,
              String(scriptSize),
              alwaysSucceedHash,
            )
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
        };
        const fee = async (
          readSize: number,
          scriptSize: number,
          held?: UTxO,
          readHash?: string,
        ) =>
          parse(await mintWith(readSize, scriptSize, held, readHash))
            .body()
            .fee();
        const pricePerByte = BigInt(
          (await emulator.fetchProtocolParameters()).minFeeRefScriptCostPerByte,
        );

        // Built with the hash and size declared
        const txHex = await mintWith(1, 700);
        expect(
          parse(txHex)
            .body()
            .referenceInputs()
            ?.values()
            .map((i) => i.transactionId().toString()),
        ).toEqual(["9".repeat(64)]);
        // The declared size is priced
        expect((await fee(700, 700)) - (await fee(1, 1))).toBe(
          699n * pricePerByte,
        );
        // The larger of two sizes declared for one out ref
        expect(await fee(100, 700)).toBe(await fee(700, 700));
        expect(await fee(700, 100)).toBe(await fee(700, 700));
        // A size declared for an out ref whose UTxO is held is not added; for the same out ref
        // not held, it is
        const held = utxoAt("6".repeat(64), address, 2_000_000n);
        expect(
          (await fee(5000, 1, undefined, "6".repeat(64))) -
            (await fee(1, 1, undefined, "6".repeat(64))),
        ).toBe(4999n * pricePerByte);
        expect(await fee(5000, 1, held)).toBe(await fee(1, 1, held));
      });
    });

    describe("synchronous methods", () => {
      /** A locked output of the always-succeeding script, added to the emulator */
      const lockedAt = (emulator: TxEmulator, txHash: string) => {
        const utxo = utxoAt(txHash, scriptAddress, 20_000_000n, {
          plutusData: "d87980",
        });
        emulator.addUtxos([utxo]);
        return utxo;
      };
      /** Spends a locked output as declared, with a redeemer of its own */
      const spendDeclared = (
        builder: MeshTxBuilder,
        utxo: UTxO,
        redeemer: number,
        at = scriptAddress,
      ) =>
        builder
          .spendingPlutusScriptV3()
          .txIn(utxo.input.txHash, 0, utxo.output.amount, at, 0)
          .txInInlineDatumPresent()
          .txInRedeemerValue(mConStr0([redeemer]), "Mesh", enoughUnits)
          .txInScript(alwaysSucceedCbor);

      it("orders the inputs and points each redeemer at its input: accepted", async () => {
        const context = await setup(validator, {
          costModels: DEFAULT_COST_MODELS,
        });
        const { emulator, address, funds } = context;
        const low = lockedAt(emulator, "3".repeat(64));
        const high = lockedAt(emulator, "4".repeat(64));
        const fee = 1_000_000n;
        const builder = new MeshTxBuilder();
        // Given in reverse ledger order
        spendDeclared(builder, high, 4);
        spendDeclared(builder, low, 3);
        const txHex = builder
          .txInCollateral(funds.input.txHash, 0, funds.output.amount, address)
          .txOut(address, lovelace(40_000_000n - fee))
          .setFee(fee.toString())
          .changeAddress(address)
          .completeSync();

        const tx = parse(txHex);
        expect(
          tx
            .body()
            .inputs()
            .values()
            .map((i) => i.transactionId().toString()),
        ).toEqual(["3".repeat(64), "4".repeat(64)]);
        const redeemers = tx.witnessSet().redeemers()!.values();
        // The redeemer for "3…" is at index 0, whatever the order of the calls
        expect(
          redeemers.map((r) => [Number(r.index()), r.data().toCbor()]).sort(),
        ).toEqual(
          [
            [
              0,
              Serialization.PlutusData.fromCore({
                constructor: 0n,
                fields: { items: [3n] },
              }).toCbor(),
            ],
            [
              1,
              Serialization.PlutusData.fromCore({
                constructor: 0n,
                fields: { items: [4n] },
              }).toCbor(),
            ],
          ].sort(),
        );
        expect(tx.body().fee()).toBe(fee);
        await accept(context, txHex);
      });

      it("merge exact repeats, refuse contradictory ones, and drop a reference to a spent out ref", async () => {
        const { address, locked, funds } = await setup(validator);
        const repeated = new MeshTxBuilder()
          .txIn(...utxoToTxIn(funds))
          .txIn(...utxoToTxIn(funds))
          .readOnlyTxInReference(funds.input.txHash, 0)
          .txOut(address, lovelace(5_000_000))
          .changeAddress(address)
          .completeSync();
        expect(parse(repeated).body().inputs().size()).toBe(1);
        expect(parse(repeated).body().referenceInputs()).toBeUndefined();

        const contradictory = new MeshTxBuilder();
        spendDeclared(contradictory, locked, 1);
        spendDeclared(contradictory, locked, 2);
        expect(() =>
          contradictory.changeAddress(address).completeSync(),
        ).toThrow(expect.objectContaining({ code: "DUPLICATE_PART" }));
      });

      it("take the datum a declared Plutus input names, and check its lock", async () => {
        const { address, locked } = await setup(validator);
        const declared = (at: string) =>
          spendDeclared(new MeshTxBuilder(), locked, 0, at)
            .changeAddress(address)
            .completeSync();
        expect(declared(scriptAddress)).toMatch(/^[0-9a-f]+$/);
        expect(() => declared(address)).toThrow(
          expect.objectContaining({ code: "WITNESS_MISMATCH" }),
        );
      });

      it("need the amount and address MeshTxBuilderV2's script spend leaves out, which complete() reads", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const spend = () => {
          const builder = new MeshTxBuilderV2({ fetcher: emulator });
          builder
            .spendPlutusV3(locked.input.txHash, 0)
            .script(alwaysSucceedCbor)
            .redeemerCbor("d87980")
            .txOut(address, lovelace(5_000_000));
          return (builder as unknown as MeshTxBuilder)
            .changeAddress(address)
            .selectUtxosFrom([funds]);
        };
        expect(() => spend().completeSync()).toThrow(
          expect.objectContaining({ code: "UNRESOLVED" }),
        );
        await accept(context, await spend().complete());
      });

      it("serve Transaction.build(false) with a read-only reference by out ref", async () => {
        const { emulator, address, holder } = await setup(validator);
        const wallet = new MeshWallet({
          networkId: 0,
          key: { type: "mnemonic", words },
          fetcher: emulator,
        });
        await wallet.init();
        const txHex = await new Transaction({ initiator: wallet })
          .setTxRefInputs([holder])
          .sendLovelace(address, "5000000")
          .build(false);
        const body = parse(txHex).body();
        expect(
          body
            .referenceInputs()
            ?.values()
            .map((i) => i.transactionId().toString()),
        ).toEqual([holder.input.txHash]);
        expect(body.outputs()[0]!.amount().coin()).toBe(5_000_000n);
      });

      it("hash with the cost models of setCostModels() or of an array given to setNetwork()", async () => {
        const costModels = DEFAULT_COST_MODELS.map((model, i) =>
          i === 2 ? [model[0]! + 1, ...model.slice(1)] : model,
        );
        const context = await setup(validator, { costModels });
        const { emulator, address, funds, locked } = context;
        const built = await unlock(
          new MeshTxBuilder({ fetcher: emulator, evaluator: null }),
          locked,
          enoughUnits,
        )
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        const hashOf = (txHex: string) =>
          parse(txHex).body().scriptDataHash()?.toString();
        // Builders without a fetcher, which never read any models
        const sync = (set?: (builder: MeshTxBuilder) => void) => {
          const builder = new MeshTxBuilder();
          set?.(builder);
          // The redeemer of `unlock`, the input declared
          return builder
            .spendingPlutusScriptV3()
            .txIn(
              locked.input.txHash,
              0,
              locked.output.amount,
              scriptAddress,
              0,
            )
            .txInInlineDatumPresent()
            .txInRedeemerValue(mConStr0([]), "Mesh", enoughUnits)
            .txInScript(alwaysSucceedCbor)
            .txOut(address, [])
            .changeAddress(address)
            .completeSync();
        };
        const builtin = sync();
        expect(hashOf(builtin)).not.toBe(hashOf(built));
        expect(hashOf(sync((b) => b.setCostModels(costModels)))).toBe(
          hashOf(built),
        );
        expect(hashOf(sync((b) => b.setNetwork(costModels)))).toBe(
          hashOf(built),
        );
      });

      it("build on what an earlier complete() read, after reset(): parameters and cost models", async () => {
        const costModels = DEFAULT_COST_MODELS.map((model, i) =>
          i === 2 ? [model[0]! + 1, ...model.slice(1)] : model,
        );
        const context = await setup(validator, {
          params: { coinsPerUtxoSize: 9000 },
          costModels,
        });
        const { emulator, address, funds, locked } = context;
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        try {
          const builder = new MeshTxBuilder({
            fetcher: emulator,
            evaluator: null,
          });
          const built = await unlock(builder, locked, enoughUnits)
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
          expect(builder.meshTxBuilderBody.network).toEqual(costModels);

          builder.reset();
          // The body is empty again, and the builder keeps what it read
          expect(builder.meshTxBuilderBody.network).toBe("mainnet");
          const sync = builder
            .spendingPlutusScriptV3()
            .txIn(
              locked.input.txHash,
              0,
              locked.output.amount,
              scriptAddress,
              0,
            )
            .txInInlineDatumPresent()
            .txInRedeemerValue(mConStr0([]), "Mesh", enoughUnits)
            .txInScript(alwaysSucceedCbor)
            .txOut(address, [])
            .changeAddress(address)
            .completeSync();
          const hashOf = (txHex: string) =>
            parse(txHex).body().scriptDataHash()?.toString();
          expect(hashOf(sync)).toBe(hashOf(built));
          // On the built-in models the hash differs
          const builtin = spendDeclared(new MeshTxBuilder(), locked, 0)
            .changeAddress(address)
            .completeSync();
          expect(hashOf(builtin)).not.toBe(hashOf(built));
          // An output without lovelace gets the minimum on the parameters read
          expect(parse(sync).body().outputs()[0]!.amount().coin()).toBe(
            minCoin(output({ address, value: {} }), { coinsPerUtxoSize: 9000 }),
          );
          expect(warn).not.toHaveBeenCalled();
        } finally {
          warn.mockRestore();
        }
      });
    });

    describe("reset()", () => {
      it("clears a fee set by hand", async () => {
        const context = await setup(validator);
        const { emulator, address, funds } = context;
        const builder = new MeshTxBuilder({ fetcher: emulator });
        const payment = () =>
          builder
            .txOut(address, lovelace(5_000_000))
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
        builder.setFee("2000000");
        expect(
          parse(await payment())
            .body()
            .fee(),
        ).toBe(2_000_000n);
        builder.reset();
        const computed = await payment();
        expect(parse(computed).body().fee()).toBeLessThan(2_000_000n);
        await accept(context, computed);
      });

      it("keeps the consumer's parameter fields, laid in call order, and the zeros of isHydra", async () => {
        const context = await setup(validator, { params: { minFeeA: 50 } });
        const { emulator, wallet, address, funds } = context;
        const builder = new MeshTxBuilder({
          fetcher: emulator,
          params: { minFeeB: 1 },
        })
          .protocolParams({ minFeeA: 60 })
          .protocolParams({ maxTxSize: 20000 });
        const payment = (b: MeshTxBuilder) =>
          b
            .txOut(address, lovelace(5_000_000))
            .changeAddress(address)
            .selectUtxosFrom([funds])
            .complete();
        await payment(builder);
        builder.reset();
        expect(protocolOf(builder)).toMatchObject({
          minFeeA: 60,
          minFeeB: 1,
          maxTxSize: 20000,
        });
        const txHex = await payment(builder);
        const signed = await wallet.signTx(txHex);
        expect(parse(txHex).body().fee()).toBe(
          60n * BigInt(signed.length / 2) + 1n,
        );

        const hydra = new MeshTxBuilder({
          fetcher: emulator,
          isHydra: true,
        }).protocolParams({ minFeeA: 44 });
        await payment(hydra);
        hydra.reset();
        expect(
          parse(await payment(hydra))
            .body()
            .fee(),
        ).toBe(0n);
      });
    });

    it("txEvaluationMultiplier multiplies nothing, and complete() warns of it once", async () => {
      const context = await setup(validator);
      const { emulator, address, funds, locked } = context;
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const spend = (builder: MeshTxBuilder) => {
          builder.txEvaluationMultiplier = 1.5;
          return unlock(builder, locked)
            .changeAddress(address)
            .selectUtxosFrom([funds]);
        };
        // The synchronous methods never evaluated: no warning
        const sync = new MeshTxBuilder();
        sync.txEvaluationMultiplier = 1.5;
        sync
          .txIn(...utxoToTxIn(funds))
          .txOut(address, lovelace(5_000_000))
          .changeAddress(address)
          .completeSync();
        expect(warn).not.toHaveBeenCalled();

        const first = new MeshTxBuilder({ fetcher: emulator });
        const txHex = await spend(first).complete();
        expect(unitsOf(txHex)).toEqual(
          (await emulator.evaluateTx(txHex)).map((a) => a.budget),
        );
        first.reset();
        // reset() puts the multiplier back to 1, as before
        expect(first.txEvaluationMultiplier).toBe(1);
        await spend(first).complete();
        await spend(new MeshTxBuilder({ fetcher: emulator })).complete();
        const multiplierWarnings = warn.mock.calls.filter(([message]) =>
          /txEvaluationMultiplier/.test(String(message)),
        );
        expect(multiplierWarnings).toHaveLength(1);
      } finally {
        warn.mockRestore();
      }
    });
  },
);
