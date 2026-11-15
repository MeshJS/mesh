import type { Protocol, TransactionPrototype } from "@meshsdk/common";
import { DEFAULT_PROTOCOL_PARAMETERS, mConStr0 } from "@meshsdk/core";
import {
  resolvePlutusScriptAddress,
  transactionPrototypeToHex,
} from "@meshsdk/core-cst";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import type {
  BuiltTxData,
  PayerSnapshot,
  TxPart,
  Utxo,
  ValidityPart,
} from "../../../src/tx-builder";
import type { Value } from "../../../src/tx-builder/value";
import {
  output,
  referenceInput,
  spend,
  TxBuilder,
  TxBuildError,
  validity,
} from "../../../src/tx-builder";
import { oversizedRoundOf } from "../../../src/tx-builder/balance";
import { outputMinCoin } from "../../../src/tx-builder/fee";
import { plainUtxo } from "../../../src/tx-builder/parts/utxo";
import {
  buildConsolidation,
  isConsolidable,
} from "../../../src/tx-builder/plan/consolidate";
import {
  addValues,
  toValuePrototype,
  valueOf,
} from "../../../src/tx-builder/value";
import { alwaysSucceedCbor, baseAddress } from "../../test-util";
import { caught, recipient, walletOf } from "./plan-emulator-util";

// The steps that consolidate a fragmented wallet, made one at a time and driven by hand as a
// plan drives them: the served step is built; when it does not fit because of what it selected,
// one consolidation step is made from that selection, and the served step is built again after
// it, spending its change, until it fits. Every transaction is signed by the wallet and sent to
// the emulator in order.

const ADA = 1_000_000n;
const LONG = 120_000;
/** More serializations of consolidation steps than one plan's worth: tries that do not end */
const MAX_SERIALIZED = 200;
const script = { code: alwaysSucceedCbor, version: "V3" as const };

const keyOf = (ref: { txHash: string; outputIndex: number }) =>
  `${ref.txHash}#${ref.outputIndex}`;

/** A seeded generator of numbers in [0, 1), the same on every run */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type World = {
  emulator: TxEmulator;
  builder: TxBuilder;
  wallet: MeshWallet;
  address: string;
  payer: PayerSnapshot;
  params: Protocol;
  funded: Utxo[];
};

/**
 * An emulator holding the wallet's UTxOs with these values, a builder and the payer as read; with
 * `maxTxSize` the builder takes the emulator's parameters with a smaller limit, so that fewer
 * UTxOs fragment the wallet
 */
const world = async (
  values: Record<string, bigint>[],
  options: {
    serializer?: (prototype: TransactionPrototype) => string;
    plutus?: boolean;
    maxTxSize?: number;
  } = {},
): Promise<World> => {
  const emulator = await TxEmulator.create({
    validator: "scalus",
    network: "preprod",
  });
  const wallet = await walletOf();
  const address = (await wallet.getChangeAddress())!;
  const funded = values.map((value) => {
    const { input, output: held } = emulator.fund(address, value);
    const utxo: Utxo = {
      txHash: input.txHash,
      outputIndex: input.outputIndex,
      address,
      value: Object.fromEntries(
        held.amount.map((a) => [a.unit, BigInt(a.quantity)]),
      ) as Utxo["value"],
    };
    return utxo;
  });
  const builder = new TxBuilder({
    network: "preprod",
    provider: emulator,
    ...(options.maxTxSize !== undefined && {
      params: {
        ...(await emulator.fetchProtocolParameters()),
        maxTxSize: options.maxTxSize,
      },
    }),
    ...(options.plutus && { evaluator: emulator }),
    ...(options.serializer && {
      serializer: { serializeTxPrototype: options.serializer } as never,
    }),
  });
  const payer = await builder.readPayer(wallet);
  const { params } = await builder.chain();
  return { emulator, builder, wallet, address, payer, params, funded };
};

type Loop = {
  /** The consolidation steps, in order */
  steps: BuiltTxData[];
  /** The served step, built after them */
  served: BuiltTxData;
  /** The served step's first error */
  first?: unknown;
};

/**
 * The loop a plan runs for one step: build it; on TX_TOO_LARGE by its selection make one
 * consolidation step and build it again after that step, spending its change
 */
const consolidated = async (
  w: World,
  parts: TxPart[],
  options: {
    canSelect?: (utxo: Utxo) => boolean;
    maxSteps?: number;
    /** Called with the served step's error before each consolidation step is made */
    before?: (error: unknown) => void;
    /** The change of a step before it, which the step spends */
    standOn?: Utxo;
    collateralReturn?: false;
  } = {},
): Promise<Loop> => {
  const { canSelect, maxSteps = 6, collateralReturn } = options;
  const deadline = parts.find(
    (part): part is ValidityPart => part.kind === "validity",
  );
  const steps: BuiltTxData[] = [];
  let standOn = options.standOn;
  let first: unknown;
  for (;;) {
    const served = standOn
      ? [...parts, spend.pubKey({ utxo: standOn })]
      : [...parts];
    try {
      const built = await w.builder.build(served, {
        payer: w.payer,
        after: steps,
        ...(canSelect && { canSelect }),
        ...(collateralReturn === false && { collateralReturn }),
      });
      return { steps, served: built, ...(first !== undefined && { first }) };
    } catch (error) {
      first ??= error;
      if (!isConsolidable(error) || steps.length >= maxSteps) throw error;
      options.before?.(error);
      const step = await buildConsolidation({
        builder: w.builder,
        payer: { snapshot: w.payer },
        error,
        parts: served,
        ...(standOn && { standOn }),
        after: steps,
        ...(deadline && { validity: deadline }),
        ...(canSelect && { options: { canSelect } }),
      });
      steps.push(step);
      standOn = plainUtxo(step.change[0]!);
    }
  }
};

const sumOf = (utxos: readonly Utxo[]): Value =>
  addValues(...utxos.map((utxo) => valueOf(utxo.value)));

const asRecord = (value: Value) => ({
  lovelace: value.coin,
  ...Object.fromEntries(
    Array.from(value.assets).filter(([, quantity]) => quantity !== 0n),
  ),
});

/** Every output at the payer's address, and what goes in comes out, the fee aside */
const expectPaysOnlyThePayer = (step: BuiltTxData, address: string) => {
  for (const each of step.outputs) expect(each.address).toBe(address);
  expect(step.collateral).toBeUndefined();
  expect(step.selectedInputs).toEqual([]);
  const into = sumOf(step.inputs);
  const out = addValues(sumOf(step.outputs), {
    coin: step.fee,
    assets: new Map(),
  });
  expect(asRecord(out)).toEqual(asRecord(into));
};

/** Signs every transaction with the wallet and sends them in order; each is accepted */
const sendAll = async (w: World, txs: readonly BuiltTxData[]) => {
  for (const tx of txs) {
    const signed = await w.wallet.signTx(tx.tx);
    expect(signed.length / 2).toBeLessThanOrEqual(w.params.maxTxSize);
    const result = await w.emulator.submit(signed);
    if (!result.accepted) throw new Error(JSON.stringify(result));
    expect(result.isValid).toBe(true);
  }
};

/** What an address holds on the emulator */
const heldAt = async (w: World, address: string): Promise<Value> =>
  addValues(
    ...(await w.emulator.fetchAddressUTxOs(address)).map((u) =>
      valueOf(
        Object.fromEntries(
          u.output.amount.map((a) => [a.unit, BigInt(a.quantity)]),
        ) as Utxo["value"],
      ),
    ),
  );

const until = (w: World) =>
  validity({ invalidHereafter: w.emulator.slot + 10_000 });

const pay = (value: Record<string, bigint>, address = recipient) =>
  output({ address, value });

/** The out refs a step spends */
const spentBy = (steps: readonly BuiltTxData[]) =>
  new Set(steps.flatMap((step) => step.inputs.map(keyOf)));

/** The outputs of a step that are not change: those it parked */
const parkedOf = (step: BuiltTxData) =>
  step.outputs.filter((each) => each.change !== true);

describe("consolidation steps on the emulator", () => {
  it(
    "puts consolidation steps before a step that does not fit: 1000 UTxOs of 2 ada and a payment of 1900 ada",
    async () => {
      const w = await world(
        Array.from({ length: 1000 }, () => ({ lovelace: 2n * ADA })),
      );
      const deadline = until(w);
      const parts = [pay({ lovelace: 1900n * ADA }), deadline];
      const alone = await caught(w.builder.build(parts, { payer: w.payer }));
      expect(TxBuildError.is(alone, "TX_TOO_LARGE")).toBe(true);
      expect(alone.details.cause).toBe("selection");

      const started = Date.now();
      const { steps, served, first } = await consolidated(w, parts);
      const took = Date.now() - started;
      expect(took).toBeLessThan(30_000);

      expect(steps.length).toBeGreaterThanOrEqual(2);
      // The first step spends what the failed build selected, in the order it took them
      const order = oversizedRoundOf(first)!.selected.map(keyOf);
      const firstInputs = new Set(steps[0]!.inputs.map(keyOf));
      expect(
        order.slice(0, firstInputs.size).every((k) => firstInputs.has(k)),
      ).toBe(true);
      for (const [i, step] of steps.entries()) {
        expectPaysOnlyThePayer(step, w.address);
        expect(step.validity!.invalidHereafter).toBe(
          Number(deadline.invalidHereafter),
        );
        expect(step.validity!.invalidBefore).toBeUndefined();
        expect(step.change).toHaveLength(1);
        // Each spends the change of the one before it
        if (i > 0)
          expect(step.inputs.map(keyOf)).toContain(
            keyOf(steps[i - 1]!.change[0]!),
          );
      }
      expect(served.inputs.map(keyOf)).toContain(
        keyOf(steps.at(-1)!.change[0]!),
      );
      // No UTxO is spent twice
      const all = [...steps, served].flatMap((tx) => tx.inputs.map(keyOf));
      expect(new Set(all).size).toBe(all.length);

      const before = await heldAt(w, w.address);
      await sendAll(w, [...steps, served]);
      expect((await heldAt(w, recipient)).coin).toBe(1900n * ADA);
      const fees = [...steps, served].reduce((total, tx) => total + tx.fee, 0n);
      expect(before.coin - (await heldAt(w, w.address)).coin).toBe(
        1900n * ADA + fees,
      );
    },
    LONG,
  );

  it(
    "parks tokens the step does not need: they leave the change, and no later step spends them",
    async () => {
      const policies = ["a1", "b2", "c3"].map((p) => p.repeat(28));
      // 28-byte names: a selection of 100 such UTxOs takes 34 kB
      const values = Array.from({ length: 200 }, (_, i) => ({
        lovelace: 10n * ADA,
        ...Object.fromEntries(
          Array.from({ length: 8 }, (_, j) => [
            `${policies[j % 3]}${(i * 8 + j).toString(16).padStart(56, "0")}`,
            1n,
          ]),
        ),
      }));
      const w = await world(values);
      const parts = [pay({ lovelace: 1000n * ADA }), until(w)];
      const alone = await caught(w.builder.build(parts, { payer: w.payer }));
      expect(isConsolidable(alone)).toBe(true);
      const { steps, served } = await consolidated(w, parts);
      expect(steps.length).toBeGreaterThanOrEqual(1);

      const parked: Utxo[] = [];
      for (const step of steps) {
        expectPaysOnlyThePayer(step, w.address);
        // Every token of its inputs is parked; its change holds lovelace alone
        const tokens = sumOf(step.inputs).assets;
        const outside = parkedOf(step);
        expect(outside.length).toBeGreaterThan(0);
        expect(asRecord({ coin: 0n, assets: sumOf(outside).assets })).toEqual(
          asRecord({ coin: 0n, assets: tokens }),
        );
        for (const change of step.change)
          expect(Object.keys(change.value)).toEqual(["lovelace"]);
        // Each with the least lovelace an output of its tokens needs
        for (const each of outside) {
          expect(each.address).toBe(w.address);
          const tokensOnly = { ...each.value, lovelace: 0n };
          expect(each.value.lovelace).toBe(
            outputMinCoin(
              {
                address: each.address,
                amount: toValuePrototype(valueOf(tokensOnly)),
              },
              w.params.coinsPerUtxoSize,
            ),
          );
        }
        parked.push(...outside);
      }
      // The served step ends with few inputs, one of them from consolidation: the change of the
      // last step
      const made = new Set(steps.map((step) => step.txHash));
      expect(served.inputs.filter((each) => made.has(each.txHash))).toEqual([
        plainUtxo(steps.at(-1)!.change[0]!),
      ]);
      expect(served.inputs.length).toBeLessThan(
        oversizedRoundOf(alone)!.selected.length / 10,
      );
      const later = spentBy([...steps, served]);
      for (const each of parked) expect(later.has(keyOf(each))).toBe(false);

      await sendAll(w, [...steps, served]);
      const left = new Set(
        (await w.emulator.fetchAddressUTxOs(w.address)).map((u) =>
          keyOf(u.input),
        ),
      );
      for (const each of parked) expect(left.has(keyOf(each))).toBe(true);
      expect((await heldAt(w, recipient)).coin).toBe(1000n * ADA);
    },
    LONG,
  );

  it(
    "keeps the tokens the step needs in the change: a payment of a token spread over many UTxOs",
    async () => {
      const wanted = `${"d4".repeat(28)}cafe`;
      const other = (i: number) =>
        `${"e5".repeat(28)}${i.toString(16).padStart(56, "0")}`;
      const values = Array.from({ length: 400 }, (_, i) => ({
        lovelace: 2n * ADA,
        [wanted]: 5n,
        [other(i)]: 7n,
      }));
      const w = await world(values);
      const parts = [pay({ [wanted]: 1500n }), until(w)];
      const alone = await caught(w.builder.build(parts, { payer: w.payer }));
      expect(isConsolidable(alone)).toBe(true);
      const { steps, served } = await consolidated(w, parts);
      expect(steps.length).toBeGreaterThanOrEqual(1);
      for (const step of steps) {
        expectPaysOnlyThePayer(step, w.address);
        const into = sumOf(step.inputs).assets;
        // All of the wanted token goes on in the change, every other token is parked
        expect(sumOf(step.change).assets.get(wanted)).toBe(into.get(wanted));
        for (const change of step.change)
          expect(Object.keys(change.value).sort()).toEqual(
            ["lovelace", wanted].sort(),
          );
        for (const each of parkedOf(step))
          expect(each.value[wanted]).toBeUndefined();
        const parkedTokens = sumOf(parkedOf(step)).assets;
        for (const [unit, quantity] of into)
          if (unit !== wanted) expect(parkedTokens.get(unit)).toBe(quantity);
      }
      await sendAll(w, [...steps, served]);
      expect((await heldAt(w, recipient)).assets.get(wanted)).toBe(1500n);
      const kept = await heldAt(w, w.address);
      expect(kept.assets.get(wanted)).toBe(2000n - 1500n);
      for (let i = 0; i < 400; i++) expect(kept.assets.get(other(i))).toBe(7n);
    },
    LONG,
  );

  it(
    "leaves a step with a Plutus part the collateral it needs",
    async () => {
      const w = await world(
        Array.from({ length: 500 }, () => ({ lovelace: 1_900_000n })),
        { plutus: true },
      );
      const locked = { txHash: "7".repeat(64), outputIndex: 0 };
      w.emulator.addUtxos([
        {
          input: locked,
          output: {
            address: resolvePlutusScriptAddress(script, 0),
            amount: [{ unit: "lovelace", quantity: "20000000" }],
            plutusData: "d87980",
          },
        },
      ]);
      // Nearly all the wallet holds: selection leaves one UTxO, too small for collateral
      const parts = [
        spend.plutus({
          utxo: locked,
          script,
          redeemer: { data: mConStr0([]) },
        }),
        pay({ lovelace: 963n * ADA }),
        until(w),
      ];
      const { steps, served, first } = await consolidated(w, parts);
      const selected = oversizedRoundOf(first)!.selected;
      expect(selected.length).toBeGreaterThanOrEqual(497);
      expect(steps.length).toBeGreaterThanOrEqual(1);
      // What the failed build put up as collateral stays out of every consolidation step
      const consolidatedKeys = spentBy(steps);
      expect(
        selected.filter((u) => !consolidatedKeys.has(keyOf(u))).length,
      ).toBeGreaterThan(0);
      const putUp = oversizedRoundOf(first)!.collateral;
      expect(putUp.length).toBeGreaterThan(0);
      for (const each of putUp)
        expect(consolidatedKeys.has(keyOf(each))).toBe(false);
      for (const step of steps) expectPaysOnlyThePayer(step, w.address);
      expect(served.collateral!.inputs.length).toBeGreaterThan(0);
      for (const each of served.collateral!.inputs)
        expect(consolidatedKeys.has(keyOf(each))).toBe(false);
      await sendAll(w, [...steps, served]);
      expect((await heldAt(w, recipient)).coin).toBe(963n * ADA);
    },
    LONG,
  );

  it(
    "keeps out of every consolidation step the collateral the served step put up",
    async () => {
      const token = `${"d4".repeat(28)}cafe`;
      // The change the step stands on holds the token it pays, so the change of a consolidation
      // step holds it too, and without a collateral return no change can be collateral
      const w = await world(
        [
          { lovelace: 5n * ADA, [token]: 1000n },
          ...Array.from({ length: 100 }, () => ({ lovelace: 900_000n })),
        ],
        { maxTxSize: 4096 },
      );
      const locked = { txHash: "7".repeat(64), outputIndex: 0 };
      w.emulator.addUtxos([
        {
          input: locked,
          output: {
            address: resolvePlutusScriptAddress(script, 0),
            amount: [{ unit: "lovelace", quantity: "20000000" }],
            plutusData: "d87980",
          },
        },
      ]);
      // Nearly all the wallet holds: selection takes every lovelace-only UTxO, and one
      // consolidation step can spend them all
      const parts = [
        spend.plutus({
          utxo: locked,
          script,
          redeemer: {
            data: mConStr0([]),
            exUnits: { mem: 200_000, steps: 100_000_000 },
          },
        }),
        pay({ lovelace: 113n * ADA, [token]: 500n }),
        until(w),
      ];
      const { steps, served, first } = await consolidated(w, parts, {
        standOn: w.funded[0]!,
        collateralReturn: false,
      });
      const round = oversizedRoundOf(first)!;
      const selected = new Set(round.selected.map(keyOf));
      expect(selected.size).toBe(100);
      // What the failed build put up was selected too
      expect(round.collateral.length).toBeGreaterThan(0);
      for (const each of round.collateral)
        expect(selected.has(keyOf(each))).toBe(true);
      expect(steps.length).toBeGreaterThanOrEqual(1);
      const consolidatedKeys = spentBy(steps);
      for (const each of round.collateral)
        expect(consolidatedKeys.has(keyOf(each))).toBe(false);
      for (const step of steps) {
        expectPaysOnlyThePayer(step, w.address);
        expect(sumOf(step.change).assets.get(token)).toBe(1000n);
      }
      expect(served.collateral!.inputs.length).toBeGreaterThan(0);
      for (const each of served.collateral!.inputs)
        expect(consolidatedKeys.has(keyOf(each))).toBe(false);
      await sendAll(w, [...steps, served]);
      const paid = await heldAt(w, recipient);
      expect(paid.coin).toBe(113n * ADA);
      expect(paid.assets.get(token)).toBe(500n);
    },
    LONG,
  );

  it(
    "never spends a UTxO canSelect refuses, also one it refuses after the step's build",
    async () => {
      const w = await world(
        Array.from({ length: 900 }, () => ({ lovelace: 2n * ADA })),
      );
      const refused = new Set(
        w.funded.filter((_, i) => i % 3 === 0).map(keyOf),
      );
      const canSelect = (utxo: Utxo) => !refused.has(keyOf(utxo));
      const lateRefused: string[] = [];
      const parts = [pay({ lovelace: 1000n * ADA }), until(w)];
      const { steps, served } = await consolidated(w, parts, {
        canSelect,
        // Refused meanwhile: the first UTxOs the failed build selected
        before: (error) => {
          if (lateRefused.length > 0) return;
          for (const utxo of oversizedRoundOf(error)!.selected.slice(0, 10)) {
            lateRefused.push(keyOf(utxo));
            refused.add(keyOf(utxo));
          }
        },
      });
      expect(lateRefused).toHaveLength(10);
      expect(steps.length).toBeGreaterThanOrEqual(1);
      const spent = spentBy([...steps, served]);
      for (const key of refused) expect(spent.has(key)).toBe(false);
      for (const step of steps) expectPaysOnlyThePayer(step, w.address);
      await sendAll(w, [...steps, served]);
    },
    LONG,
  );

  it(
    "never spends a UTxO the served step's parts name",
    async () => {
      const w = await world(
        Array.from({ length: 600 }, () => ({ lovelace: 2n * ADA })),
      );
      const [read, spent] = [w.funded[5]!, w.funded[6]!];
      const parts = [
        referenceInput({ utxo: read }),
        spend.pubKey({ utxo: spent }),
        pay({ lovelace: 1000n * ADA }),
        until(w),
      ];
      const { steps, served } = await consolidated(w, parts);
      expect(steps.length).toBeGreaterThanOrEqual(1);
      const consolidatedKeys = spentBy(steps);
      expect(consolidatedKeys.has(keyOf(read))).toBe(false);
      expect(consolidatedKeys.has(keyOf(spent))).toBe(false);
      expect(served.inputs.map(keyOf)).toContain(keyOf(spent));
      expect(served.referenceInputs.map(keyOf)).toContain(keyOf(read));
      await sendAll(w, [...steps, served]);
    },
    LONG,
  );

  it(
    "makes a step that does not fit again with fewer inputs, each try smaller than the one that failed",
    async () => {
      const limit = 150;
      const tried: number[] = [];
      let serialized = 0;
      let maxTxSize = 0;
      // Transactions of more than `limit` inputs that pay only the wallet are judged too large
      let payerAddress = "";
      const serializer = (prototype: TransactionPrototype) => {
        const hex = transactionPrototypeToHex(prototype);
        const { inputs, outputs } = prototype.body;
        if (!outputs.every((each) => each.address === payerAddress)) return hex;
        // Retries that never end fail the build rather than the run
        if (++serialized > MAX_SERIALIZED) throw new Error("no end of tries");
        if (tried.at(-1) !== inputs.length) tried.push(inputs.length);
        if (inputs.length <= limit) return hex;
        const pad = maxTxSize - hex.length / 2 + (inputs.length - limit) * 40;
        return hex + "00".repeat(Math.max(1, pad));
      };
      const w = await world(
        Array.from({ length: 800 }, () => ({ lovelace: 2n * ADA })),
        { serializer },
      );
      payerAddress = w.address;
      maxTxSize = w.params.maxTxSize;
      const tries: number[][] = [];
      const parts = [pay({ lovelace: 1300n * ADA }), until(w)];
      const { steps, served } = await consolidated(w, parts, {
        before: () => {
          if (tried.length > 0) tries.push(tried.splice(0));
        },
      });
      tries.push(tried.splice(0));
      expect(steps.length).toBeGreaterThanOrEqual(2);
      for (const step of steps) {
        expect(step.inputs.length).toBeLessThanOrEqual(limit);
        expectPaysOnlyThePayer(step, w.address);
      }
      // The first step tried more than fit, then strictly fewer after each try that failed
      const firstTries = tries[0]!;
      expect(firstTries[0]).toBeGreaterThan(limit);
      for (const [i, count] of firstTries.entries())
        if (count > limit) expect(firstTries[i + 1]).toBeLessThan(count);
      expect(firstTries.length).toBeLessThan(12);
      await sendAll(w, [...steps, served]);
      expect((await heldAt(w, recipient)).coin).toBe(1300n * ADA);
    },
    LONG,
  );

  it(
    "is TX_TOO_LARGE of its parts when one input alone does not fit, after a finite number of tries",
    async () => {
      const tried: number[] = [];
      let serialized = 0;
      let payerAddress = "";
      let maxTxSize = 0;
      // Every transaction that pays only the wallet is judged too large
      const serializer = (prototype: TransactionPrototype) => {
        const hex = transactionPrototypeToHex(prototype);
        const { inputs, outputs } = prototype.body;
        if (!outputs.every((each) => each.address === payerAddress)) return hex;
        // Retries that never end fail the build rather than the run
        if (++serialized > MAX_SERIALIZED) throw new Error("no end of tries");
        if (tried.at(-1) !== inputs.length) tried.push(inputs.length);
        return (
          hex + "00".repeat(maxTxSize - hex.length / 2 + 1 + inputs.length)
        );
      };
      const w = await world(
        Array.from({ length: 600 }, () => ({ lovelace: 2n * ADA })),
        { serializer },
      );
      payerAddress = w.address;
      maxTxSize = w.params.maxTxSize;
      const error = await caught(
        consolidated(w, [pay({ lovelace: 1000n * ADA }), until(w)]),
      );
      expect(TxBuildError.is(error, "TX_TOO_LARGE")).toBe(true);
      expect(error.details.cause).toBe("parts");
      expect(isConsolidable(error)).toBe(false);
      expect(tried.at(-1)).toBe(1);
      for (let i = 1; i < tried.length; i++)
        expect(tried[i]).toBeLessThan(tried[i - 1]!);
    },
    LONG,
  );

  it(
    "pays only the payer, over random fragmented wallets of lovelace and tokens",
    async () => {
      const random = seeded(20261115);
      const policies = ["f1", "f2"].map((p) => p.repeat(28));
      const units = policies.flatMap((policy) =>
        Array.from(
          { length: 30 },
          (_, i) => `${policy}${i.toString(16).padStart(6, "0")}`,
        ),
      );
      const CASES = 8;
      let withSteps = 0;
      for (let c = 0; c < CASES; c++) {
        const count = 400 + Math.floor(random() * 700);
        const values = Array.from({ length: count }, () => {
          const value: Record<string, bigint> = {
            lovelace: BigInt(1_200_000 + Math.floor(random() * 3_800_000)),
          };
          if (random() < 0.3)
            for (let k = 1 + Math.floor(random() * 6); k > 0; k--)
              value[units[Math.floor(random() * units.length)]!] = BigInt(
                1 + Math.floor(random() * 1000),
              );
          return value;
        });
        const w = await world(values);
        const total = sumOf(w.funded);
        const payment: Record<string, bigint> = {
          lovelace:
            (total.coin * BigInt(70 + Math.floor(random() * 27))) / 100n,
        };
        if (random() < 0.5 && total.assets.size > 0) {
          const held = Array.from(total.assets);
          const [unit, quantity] = held[Math.floor(random() * held.length)]!;
          payment[unit] = 1n + BigInt(Math.floor(random() * Number(quantity)));
        }
        let loop: Loop;
        try {
          loop = await consolidated(w, [pay(payment), until(w)], {
            maxSteps: 4,
          });
        } catch (error) {
          // Or the step's own error, and nothing to send
          expect(TxBuildError.is(error)).toBe(true);
          continue;
        }
        const { steps, served } = loop;
        if (steps.length > 0) withSteps++;
        for (const step of steps) {
          expectPaysOnlyThePayer(step, w.address);
          // Its change holds no token but those the payment takes
          for (const change of step.change)
            for (const unit of Object.keys(change.value))
              expect(unit === "lovelace" || unit in payment).toBe(true);
        }
        const before = await heldAt(w, w.address);
        await sendAll(w, [...steps, served]);
        const after = await heldAt(w, w.address);
        const fees = [...steps, served].reduce((sum, tx) => sum + tx.fee, 0n);
        const paid = valueOf(payment as Utxo["value"]);
        // The payer lost the payment and the fees, nothing else
        expect(
          asRecord(addValues(after, paid, { coin: fees, assets: new Map() })),
        ).toEqual(asRecord(before));
        expect(asRecord(await heldAt(w, recipient))).toEqual(asRecord(paid));
      }
      // Most of the wallets needed consolidation steps
      expect(withSteps).toBeGreaterThanOrEqual(CASES / 2);
    },
    LONG,
  );
});

describe("which failed builds consolidation serves", () => {
  const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
  const wallet = baseAddress(1);
  let next = 0x900;
  const utxo = (lovelace: bigint): Utxo => ({
    txHash: (++next).toString(16).padStart(64, "e"),
    outputIndex: 0,
    address: wallet,
    value: { lovelace },
  });
  const many = (count: number, lovelace: bigint) =>
    Array.from({ length: count }, () => utxo(lovelace));
  const builder = new TxBuilder({ network: "preprod", params });

  it("serves TX_TOO_LARGE by selection, and no other error", async () => {
    const bySelection = await caught(
      builder.build(pay({ lovelace: 1000n * ADA }), {
        payer: { changeAddress: wallet, utxos: many(600, 2n * ADA) },
      }),
    );
    expect(isConsolidable(bySelection)).toBe(true);

    const byParts = await caught(
      builder.build(
        Array.from({ length: 300 }, () => pay({ lovelace: 2n * ADA })),
        { payer: { changeAddress: wallet, utxos: [utxo(10_000n * ADA)] } },
      ),
    );
    expect(byParts.details.cause).toBe("parts");
    expect(isConsolidable(byParts)).toBe(false);

    const short = await caught(
      builder.build(pay({ lovelace: 1000n * ADA }), {
        payer: { changeAddress: wallet, utxos: many(3, 2n * ADA) },
      }),
    );
    expect(TxBuildError.is(short, "INSUFFICIENT_FUNDS")).toBe(true);
    expect(isConsolidable(short)).toBe(false);

    // A sweep's error stands
    const sweep = await caught(
      builder.build([], {
        payer: { changeAddress: wallet, utxos: many(600, 2n * ADA) },
        sendAllTo: recipient,
      }),
    );
    expect(TxBuildError.is(sweep, "TX_TOO_LARGE")).toBe(true);
    expect(isConsolidable(sweep)).toBe(false);

    // An error not raised by balancing
    const made = new TxBuildError("TX_TOO_LARGE", "made by hand", {
      details: { size: 20_000, maxTxSize: 16_384, cause: "selection" },
    });
    expect(isConsolidable(made)).toBe(false);
    expect(isConsolidable(undefined)).toBe(false);
  });

  it("throws back an error it does not serve, building nothing", async () => {
    const short = await caught(
      builder.build(pay({ lovelace: 1000n * ADA }), {
        payer: { changeAddress: wallet, utxos: many(3, 2n * ADA) },
      }),
    );
    const thrown = await caught(
      buildConsolidation({
        builder,
        payer: { snapshot: { changeAddress: wallet, utxos: [] } },
        error: short,
        parts: [],
        after: [],
      }),
    );
    expect(thrown).toBe(short);
  });
});
