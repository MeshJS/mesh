import {
  deserializeAddress,
  mConStr0,
  NativeScript,
  resolveScriptRef,
  UTxO,
} from "@meshsdk/core";
import { resolvePlutusScriptAddress } from "@meshsdk/core-cst";
import { TxEmulator, TxResult } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import {
  BuildOptions,
  BuiltTx,
  minFee,
  mint,
  output,
  referenceInput,
  spend,
  TxBuilder,
  TxPart,
} from "../../src/tx-builder";
import { scriptDataHashOf } from "../../src/tx-builder/hashes";
import { alwaysSucceedCbor, baseAddress } from "../test-util";

const words = Array(24).fill("solution");
const recipient = baseAddress(2);
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);
const unit = { data: mConStr0([]) };

const rules = (result: TxResult) =>
  result.accepted ? [] : result.errors.map((e) => e.rule);
const keyOf = (u: UTxO) => `${u.input.txHash}#${u.input.outputIndex}`;
const spends = (built: BuiltTx, utxo: UTxO) =>
  built.inputs.some((u) => keyOf(u) === keyOf(utxo));
const pay = (lovelace: bigint) =>
  output({ address: recipient, value: { lovelace } });
const lovelace = (ada: bigint) => [
  { unit: "lovelace", quantity: String(ada * 1_000_000n) },
];

/** The script as an attached witness puts it in the witness set */
const attachedCbor = (() => {
  const { witness } = mint.plutus({
    script: plutusScript,
    redeemer: unit,
    assets: { "01": 1n },
  });
  if (witness.type !== "plutus" || witness.script.type !== "attached")
    throw new Error("expected an attached Plutus script");
  return witness.script.cbor;
})();

/** An emulator of preprod at a fixed slot, a builder on it, and a wallet */
const setup = async (
  validator: "scalus" | "cquisitor",
  evaluator: "emulator" | "default" = "emulator",
) => {
  const emulator = await TxEmulator.create({
    validator,
    network: "preprod",
    slot: 100_000_000,
  });
  const builder = new TxBuilder({
    network: "preprod",
    provider: emulator,
    ...(evaluator === "emulator" && { evaluator: emulator }),
  });
  const wallet = new MeshWallet({
    networkId: 0,
    key: { type: "mnemonic", words },
  });
  await wallet.init();
  const address = (await wallet.getChangeAddress())!;
  let next = 0;
  /** An output put on the ledger as it is given */
  const add = (output: UTxO["output"]): UTxO => {
    const txHash = (++next).toString(16).padStart(64, "a");
    emulator.addUtxos([{ input: { txHash, outputIndex: 0 }, output }]);
    return emulator.utxos({ txHash })[0]!;
  };
  /** A payer UTxO holding `script` as its reference script */
  const holder = (
    ada: bigint,
    script: Parameters<typeof resolveScriptRef>[0],
  ) =>
    add({
      address,
      amount: lovelace(ada),
      scriptRef: resolveScriptRef(script),
    });
  /** A payer UTxO without a script */
  const plain = (ada: bigint) => add({ address, amount: lovelace(ada) });
  /** An output locked by the script, with a datum, and holding `scriptRef` when given */
  const locked = (scriptRef?: string) =>
    add({
      address: scriptAddress,
      amount: lovelace(10n),
      plutusData: "d87980",
      ...(scriptRef !== undefined && { scriptRef }),
    });
  const build = (parts: TxPart[], options: Omit<BuildOptions, "payer"> = {}) =>
    builder.build(parts, {
      payer: { changeAddress: address, utxos: emulator.utxos({ address }) },
      ...options,
    });
  const submit = async (built: BuiltTx) =>
    emulator.submit(await wallet.signTx(built.tx));
  const params = await emulator.fetchProtocolParameters();
  const costModels = await emulator.fetchCostModels();
  /**
   * The fee covers the transaction as built, and is below what it costs with the script
   * attached again: no round priced the copy that was left out
   */
  const feeContext = (built: BuiltTx) => ({
    params,
    vkeyWitnesses: built.signers.keyHashes.length,
    inputs: [...built.inputs, ...built.referenceInputs],
  });
  /** The fee covers the transaction as built */
  const expectFeeCovers = (built: BuiltTx) =>
    expect(built.fee).toBeGreaterThanOrEqual(
      minFee(built.prototype, feeContext(built)),
    );
  const expectFeeWithoutCopy = (
    built: BuiltTx,
    copy: { plutus_v3_scripts: string[] } | { native_scripts: unknown[] },
  ) => {
    const context = feeContext(built);
    expectFeeCovers(built);
    const withCopy = {
      ...built.prototype,
      witness_set: { ...built.prototype.witness_set, ...copy },
    } as BuiltTx["prototype"];
    expect(built.fee).toBeLessThan(minFee(withCopy, context));
  };
  /** The script data hash commits to the cost model of Plutus V3, which the input's copy runs */
  const expectV3ScriptData = (built: BuiltTx) => {
    const hash = built.prototype.body.script_data_hash;
    expect(hash).toBe(scriptDataHashOf(built.tx, new Set(["V3"]), costModels));
    expect(hash).not.toBe(scriptDataHashOf(built.tx, new Set(), costModels));
  };
  return {
    emulator,
    address,
    holder,
    plain,
    locked,
    build,
    submit,
    expectFeeCovers,
    expectFeeWithoutCopy,
    expectV3ScriptData,
  };
};

/*
 * A script attached to a part while the transaction spends or reads an output that holds the
 * same script as its reference script: the ledger refuses the attached copy as extraneous, so
 * the build leaves it out. Only the scalus validator checks for the extra script; both check
 * that every script the transaction runs is found, and the script data hash.
 */
describe.each(["scalus", "cquisitor"] as const)(
  "TxBuilder scripts the inputs hold, on TxEmulator (%s)",
  (validator) => {
    it.each(["emulator", "default"] as const)(
      "mints with an attached policy the payer's only UTxO holds, with the %s evaluator",
      async (evaluator) => {
        const s = await setup(validator, evaluator);
        const only = s.holder(30n, plutusScript);
        const built = await s.build([
          mint.plutus({
            script: plutusScript,
            redeemer: unit,
            assets: { "6d": 1n },
          }),
        ]);

        expect(built.selectedInputs.map(keyOf)).toEqual([keyOf(only)]);
        expect(built.prototype.witness_set.plutus_v3_scripts).toBeUndefined();
        s.expectV3ScriptData(built);
        s.expectFeeWithoutCopy(built, { plutus_v3_scripts: [attachedCbor] });
        expect(rules(await s.submit(built))).toEqual([]);
      },
    );

    it("spends a script output that holds its own validator, the validator given attached", async () => {
      const s = await setup(validator);
      s.plain(20n);
      const own = s.locked(resolveScriptRef(plutusScript));
      const built = await s.build([
        spend.plutus({ utxo: own, script: plutusScript, redeemer: unit }),
      ]);

      expect(spends(built, own)).toBe(true);
      expect(built.prototype.witness_set.plutus_v3_scripts).toBeUndefined();
      expect(built.prototype.body.reference_inputs).toBeUndefined();
      s.expectV3ScriptData(built);
      s.expectFeeWithoutCopy(built, { plutus_v3_scripts: [attachedCbor] });
      expect(rules(await s.submit(built))).toEqual([]);
    });

    it.each([
      ["sendAllTo sweeps it", "sweep"],
      ["selection takes it after the plain UTxO in one pass", "selection"],
      ["a spend part names it", "part"],
    ] as const)(
      "spends with an attached validator while the payer UTxO that holds it is spent: %s",
      async (_, how) => {
        const s = await setup(validator);
        const small = s.plain(3n);
        const held = s.holder(40n, plutusScript);
        const parts: TxPart[] = [
          spend.plutus({
            utxo: s.locked(),
            script: plutusScript,
            redeemer: unit,
          }),
        ];
        const options: Omit<BuildOptions, "payer"> = {};
        if (how === "sweep") options.sendAllTo = recipient;
        // More than the script output and the plain UTxO hold, so one selection takes the plain
        // UTxO and then the one with a reference script, which is ranked last
        if (how === "selection") parts.push(pay(20_000_000n));
        if (how === "part") parts.push(spend.pubKey({ utxo: held }));
        const built = await s.build(parts, options);

        expect(spends(built, held)).toBe(true);
        if (how === "selection")
          expect(built.selectedInputs.map(keyOf)).toEqual(
            [small, held].map(keyOf).sort(),
          );
        expect(built.prototype.witness_set.plutus_v3_scripts).toBeUndefined();
        s.expectV3ScriptData(built);
        s.expectFeeWithoutCopy(built, { plutus_v3_scripts: [attachedCbor] });
        expect(rules(await s.submit(built))).toEqual([]);
      },
    );

    it("drops the attached validator once a later round selects the payer UTxO that holds it", async () => {
      const s = await setup(validator);
      const small = s.plain(3n);
      const held = s.holder(40n, plutusScript);
      const rounds: { round: number; fee: bigint; selected: number }[] = [];
      // The script output and the plain UTxO leave 1 ADA of change at a fee of nothing, so the
      // first priced round has the plain UTxO only and carries the attached copy; the fee it
      // sets leaves the change short of its minimum, and that selects the holder
      const built = await s.build(
        [
          spend.plutus({
            utxo: s.locked(),
            script: plutusScript,
            redeemer: unit,
          }),
          pay(12_000_000n),
        ],
        {
          trace: (event) => {
            if (event.type === "round") rounds.push(event);
          },
        },
      );

      // The priced rounds of the last balancing, after the evaluation: each balancing starts at
      // round 0 and a fee of nothing
      const last = rounds.slice(
        rounds.findLastIndex(
          (r, i) => i === 0 || r.round <= rounds[i - 1]!.round,
        ),
      );
      expect(last[0]).toMatchObject({ fee: 0n, selected: 1 });
      expect(last[last.length - 1]!.selected).toBe(2);
      expect(last[last.length - 1]!.fee).toBeGreaterThan(0n);
      expect(built.selectedInputs.map(keyOf).sort()).toEqual(
        [small, held].map(keyOf).sort(),
      );
      expect(built.prototype.witness_set.plutus_v3_scripts).toBeUndefined();
      s.expectV3ScriptData(built);
      // The fee only rises, so it may keep the price of the round that still carried the copy;
      // it covers the transaction as built
      s.expectFeeCovers(built);
      expect(rules(await s.submit(built))).toEqual([]);
    });

    it("mints with an attached policy a reference input holds", async () => {
      const s = await setup(validator);
      s.plain(20n);
      const read = s.holder(30n, plutusScript);
      // An output a part reads is never selected
      const built = await s.build([
        referenceInput({ utxo: read }),
        mint.plutus({
          script: plutusScript,
          redeemer: unit,
          assets: { "6d": 1n },
        }),
      ]);

      expect(spends(built, read)).toBe(false);
      expect(built.referenceInputs.map(keyOf)).toEqual([keyOf(read)]);
      expect(built.prototype.witness_set.plutus_v3_scripts).toBeUndefined();
      s.expectV3ScriptData(built);
      s.expectFeeWithoutCopy(built, { plutus_v3_scripts: [attachedCbor] });
      expect(rules(await s.submit(built))).toEqual([]);
    });

    it("mints with an attached native policy a selected payer UTxO holds", async () => {
      const s = await setup(validator);
      const policy: NativeScript = {
        type: "sig",
        keyHash: deserializeAddress(s.address).pubKeyHash,
      };
      const held = s.holder(50n, policy);
      const minted = mint.native({ script: policy, assets: { "01": 1n } });
      const built = await s.build([minted, pay(20_000_000n)]);

      expect(spends(built, held)).toBe(true);
      expect(built.prototype.witness_set.native_scripts).toBeUndefined();
      expect(built.prototype.body.script_data_hash).toBeUndefined();
      // The policy's key is still priced and asked for
      expect(built.signers.keyHashes).toEqual([policy.keyHash]);
      if (
        minted.witness.type !== "native" ||
        !("script" in minted.witness.script)
      )
        throw new Error("expected an attached native script");
      s.expectFeeWithoutCopy(built, {
        native_scripts: [minted.witness.script.script],
      });
      expect(rules(await s.submit(built))).toEqual([]);
    });

    it("keeps the attached script when the UTxO that holds it is not spent", async () => {
      const s = await setup(validator);
      const plain = s.plain(30n);
      const held = s.holder(30n, plutusScript);
      const built = await s.build(
        [
          spend.plutus({
            utxo: s.locked(),
            script: plutusScript,
            redeemer: unit,
          }),
          pay(5_000_000n),
        ],
        {
          coinSelection: (_, candidates) =>
            candidates.filter((u) => keyOf(u) === keyOf(plain)),
        },
      );

      expect(spends(built, held)).toBe(false);
      expect(built.prototype.witness_set.plutus_v3_scripts).toEqual([
        attachedCbor,
      ]);
      s.expectV3ScriptData(built);
      expect(rules(await s.submit(built))).toEqual([]);
    });
  },
);
