import {
  emptyTxBuilderBody,
  GovernanceActionKind,
  IEvaluator,
  mConStr0,
  NativeScript,
  Protocol,
  UTxO,
} from "@meshsdk/common";
import {
  resolveNativeScriptAddress,
  resolveNativeScriptHash,
  resolveNativeScriptHex,
  resolvePaymentKeyHash,
  resolveScriptHashDRepId,
} from "@meshsdk/core";
import { resolveScriptRef } from "@meshsdk/core-cst";
import { MeshWallet } from "@meshsdk/wallet";

import {
  LargestFirstInputSelector,
  MeshTxBuilder,
  utxoToTxIn,
} from "../../src";
import { resetWarnings } from "../../src/mesh-tx-builder/warnings";
import { addWitnesses, signWitnesses } from "../../src/tx-builder";
import { exUnitsFee, refScriptFee } from "../../src/tx-builder/fee";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  mockTokenUnit,
} from "../test-util";
import {
  accept,
  lovelace,
  parse,
  scriptAddress,
  scriptRef,
  Setup,
  setup,
  unitsOf,
  unlock,
  utxoAt,
  walletOf,
} from "./legacy-adapter-util";

/** An always-true native script; nested five deep, its hash sorts before the Plutus script's */
const nested = (depth: number): NativeScript =>
  depth === 0
    ? { type: "all", scripts: [] }
    : { type: "all", scripts: [nested(depth - 1)] };
const nativeScript = nested(5);
const nativeHex = resolveNativeScriptHex(nativeScript);
const nativeHash = resolveNativeScriptHash(nativeScript);

/** The ledger's minimum fee of a signed transaction without reference scripts */
const minFeeOf = (signedTxHex: string, params: Protocol) => {
  const units = unitsOfAll(signedTxHex);
  return (
    BigInt(params.minFeeA) * BigInt(signedTxHex.length / 2) +
    BigInt(params.minFeeB) +
    exUnitsFee(units.mem, units.steps, params)
  );
};

const unitsOfAll = (txHex: string) =>
  (parse(txHex).witnessSet().redeemers()?.values() ?? []).reduce(
    (sum, r) => ({
      mem: sum.mem + r.exUnits().mem(),
      steps: sum.steps + r.exUnits().steps(),
    }),
    { mem: 0n, steps: 0n },
  );

/** The tag and index of each redeemer a transaction carries */
const pointersOf = (txHex: string) =>
  (parse(txHex).witnessSet().redeemers()?.values() ?? []).map((r) => ({
    tag: r.tag(),
    index: Number(r.index()),
  }));

/** Signs with the wallets given and submits; the ledger must accept it */
const acceptSignedBy = async (
  { emulator }: Setup,
  txHex: string,
  ...wallets: MeshWallet[]
) => {
  const witnesses = await Promise.all(
    wallets.map((wallet) => signWitnesses(wallet, txHex)),
  );
  const result = await emulator.submit(await addWitnesses(txHex, ...witnesses));
  if (!result.accepted)
    throw new Error(`rejected: ${JSON.stringify(result.errors)}`);
  return result;
};

/** The error a promise rejects with */
const refusal = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as { code?: string; details?: unknown };
  }
  throw new Error("expected an error");
};

describe.each(["scalus", "cquisitor"] as const)(
  "MeshTxBuilder's fixed defects, on TxEmulator (%s)",
  (validator) => {
    beforeEach(() => resetWarnings());

    it("points a VOTE redeemer at its voter, one redeemer for two votes of one script DRep", async () => {
      const context = await setup(validator);
      const { emulator, address, funds } = context;
      const plutusDRep = resolveScriptHashDRepId(alwaysSucceedHash);
      const nativeDRep = resolveScriptHashDRepId(nativeHash);
      emulator.setDRep({ drepId: plutusDRep });
      emulator.setDRep({ drepId: nativeDRep });
      const actions = ["1", "2"].map((digit) => ({
        transactionId: digit.repeat(64),
        govActionIndex: 0,
      }));
      for (const action of actions)
        emulator.setGovernanceAction({
          ...action,
          kind: GovernanceActionKind.InfoAction,
        });

      const builder = new MeshTxBuilder({ fetcher: emulator });
      // The native voter first: its hash sorts before the Plutus one
      builder
        .vote(
          { type: "DRep", drepId: nativeDRep },
          { txHash: actions[0]!.transactionId, txIndex: 0 },
          { voteKind: "No" },
        )
        .voteScript(nativeHex);
      for (const action of actions)
        builder
          .votePlutusScriptV3()
          .vote(
            { type: "DRep", drepId: plutusDRep },
            { txHash: action.transactionId, txIndex: 0 },
            { voteKind: "Yes" },
          )
          .voteScript(alwaysSucceedCbor)
          .voteRedeemerValue(mConStr0([]));
      const txHex = await builder
        .changeAddress(address)
        .selectUtxosFrom([funds])
        .complete();

      const procedures = parse(txHex).body().votingProcedures()!.toCore();
      expect(procedures).toHaveLength(2);
      expect(procedures[1]!.votes).toHaveLength(2);
      expect(pointersOf(txHex)).toEqual([{ tag: 4, index: 1 }]);
      await accept(context, txHex);
    });

    it("takes UTxOs whose lovelace unit is the empty unit, as before", async () => {
      const context = await setup(validator);
      const { emulator, address, funds } = context;
      const blank: UTxO = {
        ...funds,
        output: {
          ...funds.output,
          amount: funds.output.amount.map((a) =>
            a.unit === "lovelace" ? { ...a, unit: "" } : a,
          ),
        },
      };
      const build = (from: UTxO) =>
        new MeshTxBuilder({ fetcher: emulator })
          .txOut(address, [{ unit: "lovelace", quantity: "2000000" }])
          .changeAddress(address)
          .selectUtxosFrom([from])
          .complete();
      const txHex = await build(blank);
      expect(txHex).toBe(await build(funds));
      await accept(context, txHex);
    });

    it("points a MINT redeemer at its policy among all policies, native ones included", async () => {
      const context = await setup(validator);
      const { emulator, address, funds } = context;
      expect(nativeHash < alwaysSucceedHash).toBe(true);
      const txHex = await new MeshTxBuilder({ fetcher: emulator })
        .mintPlutusScriptV3()
        .mint("1", alwaysSucceedHash, "")
        .mintingScript(alwaysSucceedCbor)
        .mintRedeemerValue(mConStr0([]))
        .mint("1", nativeHash, "")
        .mintingScript(nativeHex)
        .changeAddress(address)
        .selectUtxosFrom([funds])
        .complete();
      expect(pointersOf(txHex)).toEqual([{ tag: 1, index: 1 }]);
      await accept(context, txHex);
    });

    it("gives a PROPOSE redeemer the evaluated units", async () => {
      const context = await setup(validator);
      const { emulator, address, wallet } = context;
      const [rewardAddress] = await wallet.getRewardAddresses();
      emulator.setAccount({ rewardAddress: rewardAddress! });
      emulator.setTreasury("1000000000000");
      emulator.setConstitution({
        anchor: {
          anchorUrl: "https://example.com/c.json",
          anchorDataHash: "cd".repeat(32),
        },
        guardrailScriptHash: alwaysSucceedHash,
      });
      // The emulated network's govActionDeposit
      const deposit = 1_000_000_000n;
      const funds = emulator.fund(address, {
        lovelace: deposit + 100_000_000n,
      });
      const txHex = await new MeshTxBuilder({ fetcher: emulator })
        .proposal(
          {
            kind: "TreasuryWithdrawalsAction",
            action: {
              withdrawals: { [rewardAddress!]: "10" },
              policyHash: { bytes: alwaysSucceedHash },
            },
          },
          {
            anchorUrl: "https://example.com/p.json",
            anchorDataHash: "cd".repeat(32),
          },
          rewardAddress!,
          String(deposit),
        )
        .proposalScript(alwaysSucceedCbor, "V3")
        .proposalRedeemerValue(mConStr0([]))
        .changeAddress(address)
        .selectUtxosFrom([funds])
        .complete();

      expect(pointersOf(txHex)).toEqual([{ tag: 5, index: 0 }]);
      expect(unitsOf(txHex)).toEqual(
        (await emulator.evaluateTx(txHex)).map((a) => a.budget),
      );
      expect(unitsOf(txHex)[0]!.mem).toBeGreaterThan(0);
      await accept(context, txHex);
    });

    it("builds with LargestFirstInputSelector: the units the fee was priced on are the evaluated ones", async () => {
      const context = await setup(validator);
      const { emulator, address, funds, locked, wallet } = context;
      const params = await emulator.fetchProtocolParameters();
      const txHex = await unlock(
        new MeshTxBuilder({
          fetcher: emulator,
          selector: new LargestFirstInputSelector(),
        }),
        locked,
      )
        .changeAddress(address)
        .selectUtxosFrom([funds])
        .complete();
      expect(unitsOf(txHex)).toEqual(
        (await emulator.evaluateTx(txHex)).map((a) => a.budget),
      );
      const signed = await addWitnesses(
        txHex,
        await signWitnesses(wallet, txHex),
      );
      expect(parse(txHex).body().fee()).toBeGreaterThanOrEqual(
        minFeeOf(signed, params),
      );
      await accept(context, txHex);
    });

    it("takes a fee of 0 in a body given to complete() as no fee set", async () => {
      const context = await setup(validator);
      const { emulator, address, funds } = context;
      const body = {
        ...emptyTxBuilderBody(),
        outputs: [{ address, amount: lovelace(5_000_000) }],
        extraInputs: [funds],
        changeAddress: address,
      };
      expect(body.fee).toBe("0");
      const builder = new MeshTxBuilder({ fetcher: emulator });
      const txHex = await builder.complete(body);
      expect(parse(txHex).body().fee()).toBeGreaterThan(0n);
      await accept(context, txHex);
    });

    it("reads a native script given by reference, and counts its key", async () => {
      const context = await setup(validator);
      const { emulator, address, funds } = context;
      const other = new MeshWallet({
        networkId: 0,
        key: {
          type: "cli",
          payment:
            "f083e5878c6f980c53d30b9cc2baadd780307b08acec9e0792892e013bbe9241",
        },
      });
      await other.init();
      const signer: NativeScript = {
        type: "sig",
        keyHash: resolvePaymentKeyHash((await other.getChangeAddress())!),
      };
      const lockedByKey = utxoAt(
        "5".repeat(64),
        resolveNativeScriptAddress(signer, 0),
        10_000_000n,
      );
      const holder = utxoAt("6".repeat(64), address, 20_000_000n, {
        scriptRef: resolveScriptRef(signer),
      });
      emulator.addUtxos([lockedByKey, holder]);

      const builder = new MeshTxBuilder({ fetcher: emulator });
      const txHex = await builder
        .txIn(lockedByKey.input.txHash, 0)
        .simpleScriptTxInReference(holder.input.txHash, 0)
        .changeAddress(address)
        .selectUtxosFrom([funds])
        .complete();
      // The script's key: the locked output pays for the transaction alone
      expect(builder.meshTxBuilderBody.inputs).toHaveLength(1);
      expect(builder.meshTxBuilderBody.expectedNumberKeyWitnesses).toBe(1);
      expect(parse(txHex).body().referenceInputs()?.size()).toBe(1);
      await acceptSignedBy(context, txHex, other);
    });

    it("prices the reference script an input holds from its data, not the size declared", async () => {
      const context = await setup(validator);
      const { emulator, address, holder } = context;
      const build = (scriptSize: number) =>
        new MeshTxBuilder({ fetcher: emulator })
          .txIn(
            holder.input.txHash,
            0,
            holder.output.amount,
            holder.output.address,
            scriptSize,
          )
          .changeAddress(address)
          .complete();
      const declaredWrong = await build(1);
      const declaredRight = await build(scriptRef.length / 2);
      expect(parse(declaredWrong).body().fee()).toBe(
        parse(declaredRight).body().fee(),
      );
      await accept(context, declaredWrong);
    });

    describe("collateral", () => {
      it("is chosen from selectUtxosFrom for a Plutus spend, with its total and return", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const params = await emulator.fetchProtocolParameters();
        const txHex = await unlock(
          new MeshTxBuilder({ fetcher: emulator }),
          locked,
        )
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        const body = parse(txHex).body();
        expect(body.collateral()?.values()[0]!.transactionId()).toBe(
          funds.input.txHash,
        );
        const total = body.totalCollateral()!;
        expect(total).toBe(
          (body.fee() * BigInt(params.collateralPercent) + 99n) / 100n,
        );
        expect(body.collateralReturn()!.amount().coin()).toBe(
          1_000_000_000n - total,
        );
        await accept(context, txHex);
      });

      it("refuses a Plutus spend with no key-locked UTxO to put up: INSUFFICIENT_COLLATERAL", async () => {
        const { emulator, address, funds, locked } = await setup(validator);
        await expect(
          unlock(new MeshTxBuilder({ fetcher: emulator }), locked)
            .txIn(...utxoToTxIn(funds))
            .changeAddress(address)
            .complete(),
        ).rejects.toMatchObject({ code: "INSUFFICIENT_COLLATERAL" });
      });

      it("given with txInCollateral, gets its total and return", async () => {
        const context = await setup(validator);
        const { emulator, address, funds, locked } = context;
        const collateral = emulator.fund(address, { lovelace: 10_000_000n });
        const txHex = await unlock(
          new MeshTxBuilder({ fetcher: emulator }),
          locked,
        )
          .txInCollateral(
            collateral.input.txHash,
            collateral.input.outputIndex,
            collateral.output.amount,
            collateral.output.address,
          )
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
        const body = parse(txHex).body();
        expect(
          body
            .collateral()
            ?.values()
            .map((i) => i.transactionId()),
        ).toEqual([collateral.input.txHash]);
        const total = body.totalCollateral()!;
        expect(total).toBeGreaterThan(0n);
        expect(body.collateralReturn()!.amount().coin()).toBe(
          10_000_000n - total,
        );
        expect(body.collateralReturn()!.address().toBech32()).toBe(address);
        await accept(context, txHex);
      });
    });

    it("neither evaluates nor reads cost models for a transaction without redeemers", async () => {
      const context = await setup(validator);
      const { emulator, address, funds } = context;
      const evaluateTx = jest.fn();
      const evaluator: IEvaluator = { evaluateTx };
      const fetchCostModels = jest.spyOn(emulator, "fetchCostModels");
      const txHex = await new MeshTxBuilder({ fetcher: emulator, evaluator })
        .txOut(address, lovelace(5_000_000))
        .changeAddress(address)
        .selectUtxosFrom([funds])
        .complete();
      expect(evaluateTx).not.toHaveBeenCalled();
      expect(fetchCostModels).not.toHaveBeenCalled();
      await accept(context, txHex);
    });
  },
);

describe.each(["scalus", "cquisitor"] as const)(
  "MeshTxBuilder refuses what the ledger would, on TxEmulator (%s)",
  (validator) => {
    beforeEach(() => resetWarnings());

    it("a fee set below the minimum: FEE_TOO_LOW", async () => {
      const { emulator, address, funds } = await setup(validator);
      const error = await refusal(
        new MeshTxBuilder({ fetcher: emulator })
          .txOut(address, lovelace(5_000_000))
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .setFee("100")
          .complete(),
      );
      expect(error).toMatchObject({
        code: "FEE_TOO_LOW",
        details: { fee: 100n, minFee: expect.any(BigInt) },
      });
      expect((error.details as { minFee: bigint }).minFee).toBeGreaterThan(
        100n,
      );
    });

    it("an output below its minimum: OUTPUT_BELOW_MIN_COIN", async () => {
      const { emulator, address, funds } = await setup(validator);
      const error = await refusal(
        new MeshTxBuilder({ fetcher: emulator })
          .txOut(address, lovelace(100_000))
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete(),
      );
      expect(error).toMatchObject({
        code: "OUTPUT_BELOW_MIN_COIN",
        details: { coin: 100_000n, minCoin: expect.any(BigInt) },
      });
    });

    it("an output value above maxValSize: VALUE_TOO_LARGE", async () => {
      const { emulator, address } = await setup(validator, {
        params: { maxValSize: 100 },
      });
      const units = [1, 2, 3].map(mockTokenUnit);
      const funds = emulator.fund(address, {
        lovelace: 100_000_000n,
        ...Object.fromEntries(units.map((unit) => [unit, 10n])),
      });
      await expect(
        new MeshTxBuilder({ fetcher: emulator })
          .txOut(address, [
            ...lovelace(10_000_000),
            ...units.map((unit) => ({ unit, quantity: "10" })),
          ])
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete(),
      ).rejects.toMatchObject({
        code: "VALUE_TOO_LARGE",
        details: { maxValSize: 100 },
      });
    });

    it("a transaction over maxTxSize: TX_TOO_LARGE, on the limit the consumer gave or the one read", async () => {
      const payment = (builder: MeshTxBuilder, context: Setup) =>
        builder
          .txOut(context.address, lovelace(5_000_000))
          .changeAddress(context.address)
          .selectUtxosFrom([context.funds])
          .complete();

      // The consumer's field over the network's limit
      const network = await setup(validator);
      await expect(
        payment(
          new MeshTxBuilder({ fetcher: network.emulator }).protocolParams({
            maxTxSize: 200,
          }),
          network,
        ),
      ).rejects.toMatchObject({
        code: "TX_TOO_LARGE",
        details: { size: expect.any(Number), maxTxSize: 200 },
      });
      await expect(
        payment(
          new MeshTxBuilder({
            fetcher: network.emulator,
            params: { maxTxSize: 200 },
          }),
          network,
        ),
      ).rejects.toMatchObject({
        code: "TX_TOO_LARGE",
        details: { maxTxSize: 200 },
      });

      // The limit read from the fetcher, with no field of the consumer; a field given lies over it
      const small = await setup(validator, { params: { maxTxSize: 200 } });
      await expect(
        payment(new MeshTxBuilder({ fetcher: small.emulator }), small),
      ).rejects.toMatchObject({
        code: "TX_TOO_LARGE",
        details: { maxTxSize: 200 },
      });
      await expect(
        payment(
          new MeshTxBuilder({ fetcher: small.emulator }).protocolParams({
            maxTxSize: 16384,
          }),
          small,
        ),
      ).resolves.toMatch(/^[0-9a-f]+$/);
    });

    it("a total collateral below the required amount or above the collateral inputs: INSUFFICIENT_COLLATERAL", async () => {
      const { emulator, address, funds, locked } = await setup(validator);
      const collateral = emulator.fund(address, { lovelace: 10_000_000n });
      const build = (total: string) =>
        unlock(new MeshTxBuilder({ fetcher: emulator }), locked)
          .txInCollateral(
            collateral.input.txHash,
            collateral.input.outputIndex,
            collateral.output.amount,
            collateral.output.address,
          )
          .setTotalCollateral(total)
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete();
      for (const total of ["1", "20000000"])
        await expect(build(total)).rejects.toMatchObject({
          code: "INSUFFICIENT_COLLATERAL",
        });
    });

    it("ex units of the calls above the transaction's limit: EXUNITS_EXCEEDED", async () => {
      const { emulator, address, funds, locked } = await setup(validator);
      const params = await emulator.fetchProtocolParameters();
      await expect(
        unlock(
          new MeshTxBuilder({ fetcher: emulator, evaluator: null }),
          locked,
          {
            mem: Number(params.maxTxExMem) + 1,
            steps: 1_000_000,
          },
        )
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete(),
      ).rejects.toMatchObject({ code: "EXUNITS_EXCEEDED" });
    });

    it("a key input given a script, and a script input given none: WITNESS_MISMATCH", async () => {
      const { emulator, address, funds, locked } = await setup(validator);
      const extra = emulator.fund(address, { lovelace: 5_000_000n });
      await expect(
        new MeshTxBuilder({ fetcher: emulator })
          .txIn(...utxoToTxIn(extra))
          .txInScript(nativeHex)
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete(),
      ).rejects.toMatchObject({ code: "WITNESS_MISMATCH" });
      await expect(
        new MeshTxBuilder({ fetcher: emulator })
          .txIn(...utxoToTxIn(locked))
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete(),
      ).rejects.toMatchObject({ code: "WITNESS_MISMATCH" });
    });

    it("an inline datum for an output with a datum hash: DATUM_MISMATCH; a policy id not of its script: INVALID_SCRIPT", async () => {
      const { emulator, address, funds } = await setup(validator);
      const hashed: UTxO = utxoAt("7".repeat(64), scriptAddress, 20_000_000n, {
        dataHash: "ab".repeat(32),
      });
      emulator.addUtxos([hashed]);
      await expect(
        unlock(new MeshTxBuilder({ fetcher: emulator }), hashed)
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete(),
      ).rejects.toMatchObject({ code: "DATUM_MISMATCH" });
      await expect(
        new MeshTxBuilder({ fetcher: emulator })
          .mintPlutusScriptV3()
          .mint("1", "ab".repeat(28), "")
          .mintingScript(alwaysSucceedCbor)
          .mintRedeemerValue(mConStr0([]))
          .changeAddress(address)
          .selectUtxosFrom([funds])
          .complete(),
      ).rejects.toMatchObject({ code: "INVALID_SCRIPT" });
    });
  },
);
