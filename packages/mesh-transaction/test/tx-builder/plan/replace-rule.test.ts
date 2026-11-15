import { resolvePlutusScriptAddress } from "@meshsdk/core-cst";

import type { BuiltTxData, Utxo } from "../../../src/tx-builder";
import type { LinkedPart, TxPart } from "../../../src/tx-builder/parts/types";
import type {
  BeforeEntry,
  PlanRecord,
  PlanTip,
  TxSighting,
} from "../../../src/tx-builder/plan/core";
import type {
  GuardStep,
  LineInput,
  LookAnswer,
  RuleBody,
  StepTx,
} from "../../../src/tx-builder/plan/replace";
import { collateral, referenceInput, spend } from "../../../src/tx-builder";
import { emptyPlan as emptyRecord } from "../../../src/tx-builder/plan/core";
import {
  beforeOf,
  landsBeside,
  lineClasses,
  lineTxOf,
  outRefsOfParts,
  rootGuards,
  settled,
} from "../../../src/tx-builder/plan/replace";
import { alwaysSucceedCbor, baseAddress } from "../../test-util";
import { hash, seeded, utxo } from "./plan-util";
import { accept, DEADLINES, stepOf, stepTx } from "./state-util";

// The rule that keeps a plan made in place of another from landing beside it, and the input a
// new step shares with an open transaction, worked out from data alone.

type Random = ReturnType<typeof seeded>;
type Parts = readonly (TxPart | LinkedPart)[];

/** A body that spends, reads and puts up these out refs */
const body = (
  txHash: string,
  spends: readonly (readonly [string, number])[],
  more: {
    reads?: readonly (readonly [string, number])[];
    collateral?: readonly (readonly [string, number])[];
    until?: number;
  } = {},
): BuiltTxData =>
  ({
    txHash,
    inputs: spends.map(([tx, i]) => utxo(tx, i)),
    referenceInputs: (more.reads ?? []).map(([tx, i]) => utxo(tx, i)),
    ...(more.collateral !== undefined && {
      collateral: {
        inputs: more.collateral.map(([tx, i]) => utxo(tx, i)),
        total: 5_000_000n,
      },
    }),
    validity: more.until === undefined ? {} : { until: more.until },
  }) as unknown as BuiltTxData;

const step = (
  name: string,
  built: RuleBody,
  kind?: StepTx["kind"],
): StepTx => ({ name, built, ...(kind !== undefined && { kind }) });

/** The hashes of the open transactions each step was found able to land beside */
const pairs = (
  steps: readonly LineInput[],
  open: readonly LineInput[],
  kept: readonly LineInput[] = [],
  earlier: readonly LineInput[] = [],
) =>
  Object.fromEntries(
    landsBeside(steps, open, kept, earlier).map(({ step, open }) => [
      lineTxOf(step).step,
      open.map((each) => lineTxOf(each).step),
    ]),
  );

// Hashes with letters, so that their case can differ
const X = hash(0xab01);
const Y = hash(0xcd02);
const Z = hash(0xef03);

/* ---------------------------------------------------------------------------------------------
 * A toy ledger
 * ------------------------------------------------------------------------------------------- */

/** A transaction as the toy ledger takes it */
type ToyTx = {
  readonly name: string;
  readonly txHash: string;
  readonly spends: readonly string[];
  readonly reads: readonly string[];
  readonly putUp: readonly string[];
};

const OUTPUTS = 2;
const ref = (txHash: string, index: number) => `${txHash}#${index}`;

const toyOf = (name: string, built: RuleBody): ToyTx => ({
  name,
  txHash: built.txHash.toLowerCase(),
  spends: built.inputs.map((u) => ref(u.txHash.toLowerCase(), u.outputIndex)),
  reads: (built.referenceInputs ?? []).map((u) =>
    ref(u.txHash.toLowerCase(), u.outputIndex),
  ),
  putUp: (built.collateral?.inputs ?? []).map((u) =>
    ref(u.txHash.toLowerCase(), u.outputIndex),
  ),
});

/**
 * A ledger that takes a transaction when every out ref it spends, reads or puts up is unspent,
 * and a hash once. `genesis` holds the out refs that exist before any transaction
 */
class ToyLedger {
  readonly unspent: Set<string>;
  readonly landed = new Set<string>();
  constructor(genesis: Iterable<string>) {
    this.unspent = new Set(genesis);
  }
  submit(tx: ToyTx): boolean {
    if (this.landed.has(tx.txHash)) return false;
    const needs = [...tx.spends, ...tx.reads, ...tx.putUp];
    if (!needs.every((each) => this.unspent.has(each))) return false;
    for (const each of tx.spends) this.unspent.delete(each);
    for (let i = 0; i < OUTPUTS; i++) this.unspent.add(ref(tx.txHash, i));
    this.landed.add(tx.txHash);
    return true;
  }
  /** Submits the transactions in this order, again and again, until none more lands */
  settle(txs: readonly ToyTx[]) {
    let more = true;
    while (more) {
      more = false;
      for (const tx of txs) if (this.submit(tx)) more = true;
    }
  }
}

const shuffled = <T>(r: Random, items: readonly T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const k = r.int(i + 1);
    [copy[i], copy[k]] = [copy[k]!, copy[i]!];
  }
  return copy;
};

/** The transaction and every transaction of `all` it stands on, all the way down */
const depsOf = (tx: ToyTx, all: ReadonlyMap<string, ToyTx>): ToyTx[] => {
  const out = [tx];
  const met = new Set([tx.txHash]);
  for (let i = 0; i < out.length; i++)
    for (const each of [
      ...out[i]!.spends,
      ...out[i]!.reads,
      ...out[i]!.putUp,
    ]) {
      const source = each.slice(0, each.indexOf("#"));
      const below = all.get(source);
      if (below === undefined || met.has(source)) continue;
      met.add(source);
      out.push(below);
    }
  return out;
};

/* ---------------------------------------------------------------------------------------------
 * A random line: kept, open and made bodies
 * ------------------------------------------------------------------------------------------- */

type World = {
  genesis: string[];
  kept: StepTx[];
  open: StepTx[];
  /** The open transactions as the rule is given them: some as entries of before.open */
  openGiven: LineInput[];
  made: StepTx[];
};

const randomWorld = (r: Random): World => {
  const genesis = Array.from({ length: 6 + r.int(6) }, (_, i) =>
    ref(hash(0x9000 + i), r.int(2)),
  );
  const pickFrom = <T>(items: readonly T[]) =>
    items.length === 0 ? undefined : r.pick(items);
  const split = (outRef: string): [string, number] => {
    const at = outRef.indexOf("#");
    return [outRef.slice(0, at), Number(outRef.slice(at + 1))];
  };

  // Kept: each spends what no other kept transaction spends
  const kept: StepTx[] = [];
  const keptSpent = new Set<string>();
  const keptOutputs: string[] = [];
  for (let i = 0; i < r.int(3); i++) {
    const free = genesis.filter((each) => !keptSpent.has(each));
    const one = pickFrom(free);
    if (one === undefined) break;
    keptSpent.add(one);
    const txHash = hash(0x3000 + i);
    kept.push(step(`k${i}`, body(txHash, [split(one)])));
    for (let k = 0; k < OUTPUTS; k++) keptOutputs.push(ref(txHash, k));
  }

  // Open: each spends one or two out refs of the chain, of a kept transaction or of an earlier
  // open one, and sometimes reads or puts up one more
  const open: StepTx[] = [];
  const openOutputs: string[] = [];
  for (let i = 0; i < 1 + r.int(5); i++) {
    const pool = [...genesis, ...keptOutputs, ...openOutputs, ...openOutputs];
    const spends = Array.from(
      new Set(Array.from({ length: 1 + r.int(2) }, () => r.pick(pool))),
    );
    const extra = r.pick(pool);
    const txHash = hash(0x1000 + i);
    open.push(
      step(
        `o${i}`,
        body(
          txHash,
          spends.map(split),
          r.chance(0.2)
            ? { reads: [split(extra)] }
            : r.chance(0.1)
              ? { collateral: [split(extra)] }
              : {},
        ),
      ),
    );
    for (let k = 0; k < OUTPUTS; k++) openOutputs.push(ref(txHash, k));
  }
  // An open transaction without reads is sometimes given as an entry of before.open
  const openGiven: LineInput[] = open.map((each) =>
    each.built.referenceInputs.length === 0 &&
    each.built.collateral === undefined &&
    r.chance(0.4)
      ? ({
          step: each.name,
          txHash: each.built.txHash,
          spends: each.built.inputs.map((u) => ref(u.txHash, u.outputIndex)),
        } satisfies BeforeEntry)
      : each,
  );

  // Made: no two spend one out ref, none spends what a kept transaction spends, none stands on
  // an open transaction; one may hold a root of the open ones byte for byte
  const made: StepTx[] = [];
  const madeSpent = new Set<string>();
  const madeOutputs: string[] = [];
  const openHashes = new Set(open.map((each) => each.built.txHash));
  const roots = open.filter((each) =>
    each.built.inputs.every((u) => !openHashes.has(u.txHash)),
  );
  if (r.chance(0.2) && roots.length > 0) {
    const held = r.pick(roots);
    made.push(step(`held-${held.name}`, held.built));
    for (const u of held.built.inputs)
      madeSpent.add(ref(u.txHash, u.outputIndex));
    for (let k = 0; k < OUTPUTS; k++)
      madeOutputs.push(ref(held.built.txHash, k));
  }
  for (let i = 0; i < 1 + r.int(4); i++) {
    const pool = [...genesis, ...keptOutputs, ...madeOutputs].filter(
      (each) => !keptSpent.has(each) && !madeSpent.has(each),
    );
    const spends = Array.from(
      new Set(
        Array.from({ length: 1 + r.int(2) }, () => pickFrom(pool)).filter(
          (each): each is string => each !== undefined,
        ),
      ),
    );
    if (spends.length === 0) break;
    for (const each of spends) madeSpent.add(each);
    const reads = [...genesis, ...keptOutputs, ...madeOutputs, ...openOutputs]
      .filter((each) => !openOutputs.includes(each))
      .filter((each) => !spends.includes(each));
    const read = r.chance(0.25) ? pickFrom(reads) : undefined;
    const txHash = hash(0x2000 + i);
    made.push(
      step(
        `m${i}`,
        body(
          txHash,
          spends.map(split),
          read !== undefined ? { reads: [split(read)] } : {},
        ),
        r.chance(0.1) ? "consolidation" : undefined,
      ),
    );
    for (let k = 0; k < OUTPUTS; k++) madeOutputs.push(ref(txHash, k));
  }
  return { genesis, kept, open, openGiven, made };
};

/* ---------------------------------------------------------------------------------------------
 * The pairs
 * ------------------------------------------------------------------------------------------- */

describe("landsBeside", () => {
  it("keeps apart only what no chain holds together", () => {
    const SEEDS = 2_000;
    let apart = 0;
    let besides = 0;
    let checked = 0;
    let crossings = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = seeded(Math.imul(seed, 0x9e3779b1) >>> 0);
      const world = randomWorld(r);
      const answer = landsBeside(world.made, world.openGiven, world.kept);
      const returned = new Set(
        answer.flatMap(({ step, open }) =>
          open.map((each) => `${step.name}|${lineTxOf(each).step}`),
        ),
      );
      const toys = new Map<string, ToyTx>();
      for (const each of [...world.open, ...world.made])
        toys.set(each.built.txHash, toyOf(each.name, each.built));
      const keptToys = world.kept.map((each) => toyOf(each.name, each.built));
      const fresh = () => {
        const ledger = new ToyLedger(world.genesis);
        for (const tx of keptToys)
          if (!ledger.submit(tx)) throw new Error(`seed ${seed}: kept refused`);
        return ledger;
      };
      const openHashes = new Set(world.open.map((each) => each.built.txHash));
      for (const made of world.made) {
        if (made.kind === "consolidation") continue;
        if (openHashes.has(made.built.txHash)) continue;
        const mine = depsOf(toys.get(made.built.txHash)!, toys);
        for (const open of world.open) {
          if (world.made.some((m) => m.built.txHash === open.built.txHash))
            continue;
          const theirs = depsOf(toys.get(open.built.txHash)!, toys);
          const both = [...mine, ...theirs];
          const tHash = made.built.txHash;
          const rHash = open.built.txHash;
          if (!returned.has(`${made.name}|${open.name}`)) {
            // Kept apart or settled: no order of submissions lands both
            apart++;
            const orders = [
              [mine, theirs],
              [theirs, mine],
              ...Array.from({ length: 10 }, () => [shuffled(r, both)]),
            ];
            for (const sides of orders) {
              const ledger = fresh();
              for (const side of sides) ledger.settle(side);
              if (ledger.landed.has(tHash) && ledger.landed.has(rHash))
                throw new Error(
                  `seed ${seed}: ${made.name} and ${open.name} both landed, and were called apart`,
                );
            }
            continue;
          }
          besides++;
          // Returned: some order lands both, where each side lands alone
          const alone = (txs: ToyTx[], txHash: string) => {
            const ledger = fresh();
            ledger.settle(txs);
            return ledger.landed.has(txHash);
          };
          if (!alone(mine, tHash) || !alone(theirs, rHash)) continue;
          // A read comes before the spend: either side first, and some orders more
          const orders = [
            [mine, theirs],
            [theirs, mine],
            ...Array.from({ length: 4 }, () => [shuffled(r, both)]),
          ];
          const landsBoth = orders.some((sides) => {
            const ledger = fresh();
            for (const side of sides) ledger.settle(side);
            return ledger.landed.has(tHash) && ledger.landed.has(rHash);
          });
          if (landsBoth) {
            checked++;
            continue;
          }
          // Each side reads what the other spends: neither can go first. The rule counts no
          // read, and calls such a pair able to land
          const readsOf = (txs: ToyTx[]) =>
            new Set(txs.flatMap((tx) => [...tx.reads, ...tx.putUp]));
          const spentBy = (txs: ToyTx[]) => txs.flatMap((tx) => tx.spends);
          const crossed =
            spentBy(theirs).some((each) => readsOf(mine).has(each)) &&
            spentBy(mine).some((each) => readsOf(theirs).has(each));
          crossings++;
          if (!crossed)
            throw new Error(
              `seed ${seed}: ${made.name} and ${open.name} were returned, and no chain holds both`,
            );
        }
      }
    }
    expect(apart).toBeGreaterThan(1_000);
    expect(besides).toBeGreaterThan(1_000);
    expect(checked).toBeGreaterThan(500);
  });

  it("returns an out ref one spends and the other only reads or puts up", () => {
    const r1 = step("r", body(hash(0x11), [[X, 0]]));
    expect(
      pairs([step("t", body(hash(0x21), [[Y, 0]], { reads: [[X, 0]] }))], [r1]),
    ).toEqual({ t: ["r"] });
    expect(
      pairs(
        [step("t", body(hash(0x21), [[Y, 0]], { collateral: [[X, 0]] }))],
        [r1],
      ),
    ).toEqual({ t: ["r"] });
    // And the other way round
    expect(
      pairs(
        [step("t", body(hash(0x21), [[X, 0]]))],
        [step("r", body(hash(0x11), [[Y, 0]], { reads: [[X, 0]] }))],
      ),
    ).toEqual({ t: ["r"] });
    // Spending it keeps them apart
    expect(pairs([step("t", body(hash(0x21), [[X, 0]]))], [r1])).toEqual({});
    // Another output of the same transaction does not
    expect(pairs([step("t", body(hash(0x21), [[X, 1]]))], [r1])).toEqual({
      t: ["r"],
    });
  });

  it("compares out refs with the hash in lower case", () => {
    const upper = step("r", body(hash(0x11), [[X.toUpperCase(), 0]]));
    expect(pairs([step("t", body(hash(0x21), [[X, 0]]))], [upper])).toEqual({});
    const entry: BeforeEntry = {
      step: "r",
      txHash: hash(0x11),
      spends: [`${X.toUpperCase()}#0`],
    };
    expect(pairs([step("t", body(hash(0x21), [[X, 0]]))], [entry])).toEqual({});
    // A step that holds the open transaction, its hash in upper case
    expect(
      pairs(
        [step("t", body(hash(0xfa11).toUpperCase(), [[Y, 0]]))],
        [step("r", body(hash(0xfa11), [[Y, 0]]))],
      ),
    ).toEqual({});
  });

  it("follows what each side stands on, by spending, reading or putting up", () => {
    // b is the root, on X; c spends an output of b, d only reads one of c, e puts one up
    const b = step("b", body(hash(0x11), [[X, 0]]));
    const c = step("c", body(hash(0x12), [[hash(0x11), 1]]));
    const d = step(
      "d",
      body(hash(0x13), [[Z, 0]], { reads: [[hash(0x12), 0]] }),
    );
    const e = step(
      "e",
      body(hash(0x14), [[Z, 1]], { collateral: [[hash(0x13), 0]] }),
    );
    const t = step("t", body(hash(0x21), [[X, 0]]));
    expect(pairs([t], [b, c, d, e])).toEqual({});
    // The same open transactions as entries: an entry stands on what it spends from alone
    const entries: BeforeEntry[] = [b, c].map((each) => ({
      step: each.name,
      txHash: each.built.txHash,
      spends: each.built.inputs.map((u) => `${u.txHash}#${u.outputIndex}`),
    }));
    expect(pairs([t], entries)).toEqual({});
    // A step that only reads an output of the step that shares the input is apart through it
    const t2 = step(
      "t2",
      body(hash(0x22), [[Y, 0]], { reads: [[hash(0x21), 0]] }),
    );
    const t3 = step("t3", body(hash(0x23), [[hash(0x22), 1]]));
    expect(pairs([t, t2, t3], [b, c, d, e])).toEqual({});
    // Without the step that shares it, nothing is apart
    expect(pairs([t2], [b, c])).toEqual({ t2: ["b", "c"] });
    // A step of the same plan made before: stood on, never judged
    expect(pairs([t2], [b, c], [], [t])).toEqual({});
    expect(
      pairs([t2], [b], [], [step("u", body(hash(0x29), [[Z, 0]]))]),
    ).toEqual({ t2: ["b"] });
  });

  it("leaves out a step that holds an open transaction byte for byte, and that transaction", () => {
    const b = step("b", body(hash(0x11), [[X, 0]]));
    const c = step("c", body(hash(0x12), [[hash(0x11), 1]]));
    const held = step("b", b.built);
    // c' spends the change of the held b, as the old c does
    const c2 = step("c2", body(hash(0x22), [[hash(0x11), 1]]));
    expect(pairs([held, c2], [b, c])).toEqual({});
    // A step on something else lands beside c; b is the step itself, never a second one
    const other = step("o", body(hash(0x23), [[Y, 0]]));
    expect(pairs([held, other], [b, c])).toEqual({ o: ["c"] });
  });

  it("does not judge a consolidation step", () => {
    const b = step("b", body(hash(0x11), [[X, 0]]));
    expect(
      pairs([step("join", body(hash(0x21), [[Y, 0]]), "consolidation")], [b]),
    ).toEqual({});
    expect(pairs([step("join", body(hash(0x21), [[Y, 0]]))], [b])).toEqual({
      join: ["b"],
    });
  });

  it("calls settled only what a kept transaction excludes, or what stands on one used up", () => {
    const b = step("b", body(hash(0x11), [[X, 0]]));
    const c = step("c", body(hash(0x12), [[hash(0x11), 1]]));
    const t = step("t", body(hash(0x21), [[Y, 0]]));
    // Kept: a final transaction that spends X too
    const spender = step("k", body(hash(0x31), [[X, 0]]));
    expect(pairs([t], [b, c], [spender])).toEqual({});
    expect(settled([b, c], [spender])).toEqual([b, c]);
    // One that reads X, puts it up, or spends something else settles nothing
    for (const kept of [
      step("k", body(hash(0x31), [[Z, 0]], { reads: [[X, 0]] })),
      step("k", body(hash(0x31), [[Z, 0]], { collateral: [[X, 0]] })),
      step("k", body(hash(0x31), [[X, 1]])),
    ]) {
      expect(pairs([t], [b, c], [kept])).toEqual({ t: ["b", "c"] });
      expect(settled([b, c], [kept])).toEqual([]);
    }
    // Used up: in a block with failed scripts
    const usedUp = { ...lineTxOf(b), usedUp: true as const };
    expect(pairs([t], [usedUp, c])).toEqual({});
    expect(settled([usedUp, c], [])).toEqual([usedUp, c]);
    // The transaction a step holds is settled by nothing: it is left out
    expect(settled([b], [spender], [hash(0x11)])).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------------------------
 * The guards
 * ------------------------------------------------------------------------------------------- */

const SCRIPT_ADDRESS = resolvePlutusScriptAddress(
  { code: alwaysSucceedCbor, version: "V3" },
  0,
);

const atScript = (u: Utxo): Utxo => ({ ...u, address: SCRIPT_ADDRESS });

/** An output at a payment key's address */
const owned = (txHash: string, index: number): Utxo => ({
  ...utxo(txHash, index),
  address: baseAddress(1),
});

const outRefOf = (u: Utxo) => `${u.txHash}#${u.outputIndex}`;

/** What the choice made, as out refs by root and parts by step */
const choice = (result: ReturnType<typeof rootGuards>) => ({
  roots: Object.fromEntries(
    result.roots.map(({ root, guard }) => [
      root.step,
      guard === undefined ? null : `${guard.step}:${outRefOf(guard.utxo)}`,
    ]),
  ),
  added: result.added.map(({ step, utxo }) => `${step}:${outRefOf(utxo)}`),
});

describe("rootGuards", () => {
  const x1 = owned(X, 0);
  const x2 = owned(X, 1);
  const y1 = owned(Y, 0);
  const b = step(
    "b",
    body(hash(0x11), [
      [X, 0],
      [X, 1],
    ]),
  );
  const c = step("c", body(hash(0x12), [[hash(0x11), 1]]));
  const pay = (
    name: string,
    payer = "wallet",
    parts: Parts = [],
  ): GuardStep => ({
    name,
    payer,
    parts,
  });

  it("the guard of a root is its first spent input that a read holds", () => {
    const reads = new Map([["wallet", [x2, x1, y1]]]);
    expect(choice(rootGuards([b, c], reads, [pay("main")]))).toEqual({
      roots: { b: `main:${X}#0` },
      added: [`main:${X}#0`],
    });
    // Whatever the order of the reads and of the UTxOs in them
    const r = seeded(7);
    for (let i = 0; i < 50; i++) {
      const shuffledReads = new Map(
        shuffled(r, [
          ["treasury", shuffled(r, [y1, x2])] as const,
          ["wallet", shuffled(r, [x1, x2, y1])] as const,
        ]),
      );
      expect(
        choice(
          rootGuards([b, c], shuffledReads, [
            pay("first", "treasury"),
            pay("main"),
          ]),
        ),
      ).toEqual({
        // X#0 is held by the wallet alone, and the first step of the wallet is main
        roots: { b: `main:${X}#0` },
        added: [`main:${X}#0`],
      });
    }
    // The second input, when no read holds the first
    expect(
      choice(rootGuards([b], new Map([["wallet", [x2]]]), [pay("main")])),
    ).toEqual({ roots: { b: `main:${X}#1` }, added: [`main:${X}#1`] });
    // None when no read holds one
    expect(
      choice(rootGuards([b], new Map([["wallet", [y1]]]), [pay("main")])),
    ).toEqual({ roots: { b: null }, added: [] });
  });

  it("goes to the first step built from parts whose payer's read holds it", () => {
    const reads = new Map([
      ["wallet", [y1]],
      ["treasury", [x2]],
    ]);
    expect(
      choice(
        rootGuards([b], reads, [
          pay("a"),
          { name: "fund", built: body(hash(0x41), [[Z, 0]]) },
          pay("t1", "treasury"),
          pay("t2", "treasury"),
        ]),
      ),
    ).toEqual({ roots: { b: `t1:${X}#1` }, added: [`t1:${X}#1`] });
  });

  it("takes no input a script locks, or that a part of another step names", () => {
    const steps = (parts: Parts) => [
      pay("main"),
      pay("other", "wallet", parts),
    ];
    // Locked by a script: the next input
    expect(
      choice(
        rootGuards([b], new Map([["wallet", [atScript(x1), x2]]]), [
          pay("main"),
        ]),
      ),
    ).toEqual({ roots: { b: `main:${X}#1` }, added: [`main:${X}#1`] });
    // Named by a part of another step: spent, read or put up
    for (const part of [
      spend.pubKey({ utxo: x1 }),
      referenceInput({ utxo: x1 }),
      collateral({ utxo: x1 }),
    ])
      expect(
        choice(
          rootGuards(
            [b],
            new Map([["wallet", [x1, x2]]]),
            steps([part] as Parts),
          ),
        ),
      ).toEqual({ roots: { b: `main:${X}#1` }, added: [`main:${X}#1`] });
    // Spent by a step given built
    expect(
      choice(
        rootGuards([b], new Map([["wallet", [x1, x2]]]), [
          { name: "pre", built: body(hash(0x41), [[X, 0]]) },
          pay("main"),
        ]),
      ),
    ).toEqual({ roots: { b: `main:${X}#1` }, added: [`main:${X}#1`] });
    // None left
    expect(
      choice(
        rootGuards([b], new Map([["wallet", [atScript(x1)]]]), [pay("main")]),
      ),
    ).toEqual({ roots: { b: null }, added: [] });
  });

  it("adds nothing for an input the step's parts spend already, and skips one they only read", () => {
    const reads = new Map([["wallet", [x1, x2]]]);
    expect(
      choice(
        rootGuards([b], reads, [
          pay("main", "wallet", [spend.pubKey({ utxo: x1 })] as Parts),
        ]),
      ),
    ).toEqual({ roots: { b: `main:${X}#0` }, added: [] });
    expect(
      choice(
        rootGuards([b], reads, [
          pay("main", "wallet", [referenceInput({ utxo: x1 })] as Parts),
        ]),
      ),
    ).toEqual({ roots: { b: `main:${X}#1` }, added: [`main:${X}#1`] });
  });

  it("gives one part for two roots that share the input", () => {
    const b2 = step("b2", body(hash(0x15), [[X, 0]]));
    const result = rootGuards([b, b2, c], new Map([["wallet", [x1]]]), [
      pay("main"),
    ]);
    expect(choice(result)).toEqual({
      roots: { b: `main:${X}#0`, b2: `main:${X}#0` },
      added: [`main:${X}#0`],
    });
  });

  it("finds the roots: the open transactions that stand on no open one", () => {
    const entry: BeforeEntry = {
      step: "e",
      txHash: hash(0x16),
      spends: [`${hash(0x12)}#0`],
    };
    const lone: BeforeEntry = {
      step: "f",
      txHash: hash(0x17),
      spends: [`${Y}#0`],
    };
    const reads = new Map([["wallet", [x1, y1]]]);
    expect(
      choice(rootGuards([b, c, entry, lone], reads, [pay("main")])),
    ).toEqual({
      roots: { b: `main:${X}#0`, f: `main:${Y}#0` },
      added: [`main:${X}#0`, `main:${Y}#0`],
    });
    // A root held byte for byte by a step given built is that step: what stands on it is a root
    expect(
      choice(
        rootGuards([b, c], new Map([["wallet", [x1]]]), [
          { name: "b", built: b.built },
          pay("main"),
        ]),
      ),
    ).toEqual({ roots: { c: null }, added: [] });
  });

  it("reads the out refs that parts name", () => {
    expect(
      outRefsOfParts([
        spend.pubKey({ utxo: owned(X, 0) }),
        referenceInput({ utxo: owned(Y, 1) }),
        spend.pubKey({ utxo: { step: "a", output: 0 } }),
      ] as Parts),
    ).toEqual({ named: [`${X}#0`, `${Y}#1`], spent: [`${X}#0`] });
  });
});

/* ---------------------------------------------------------------------------------------------
 * The classes and what the new record keeps
 * ------------------------------------------------------------------------------------------- */

describe("lineClasses and beforeOf", () => {
  const UNTIL = 1_000_000;
  const MARGIN = DEADLINES.expiryMarginMs;
  const tip = (timeMs: number, height = 100): PlanTip => ({
    slot: 1_000,
    timeMs,
    height,
    clockMs: timeMs,
  });
  const found = (
    txHash: string,
    more: Partial<Extract<TxSighting, { found: true }>> = {},
  ): LookAnswer => ({
    txHash,
    found: true,
    slot: 900,
    blockHeight: 90,
    ...more,
  });
  const missing = (txHash: string): LookAnswer => ({ txHash, found: false });
  const SOURCE = hash(0xf0);

  /** A plan of a final step a, a sent step b on X, and c on the change of b */
  const record = (before?: PlanRecord["before"]) => {
    const steps = [
      {
        name: "a",
        built: stepTx({
          txHash: hash(0xa0),
          inputs: [utxo(SOURCE)],
          until: UNTIL,
        }),
        standsOn: [],
      },
      {
        name: "b",
        built: stepTx({
          txHash: hash(0xa1),
          inputs: [utxo(SOURCE, 1)],
          until: UNTIL,
        }),
        standsOn: [],
      },
      {
        name: "c",
        built: stepTx({
          txHash: hash(0xa2),
          inputs: [utxo(hash(0xa1), 1)],
          until: UNTIL,
        }),
        standsOn: ["b"],
      },
    ];
    const json = accept(
      emptyRecord({
        id: "old",
        network: "preprod",
        deadlines: DEADLINES,
        options: {},
        ...(before !== undefined && { replaces: "older", before }),
      }),
      { type: "steps", steps },
    );
    return accept(accept(json, { type: "delivery", step: "b" }), {
      type: "observation",
      tip: tip(0, 100),
      sightings: [
        {
          txHash: hash(0xa0),
          found: true,
          slot: 900,
          blockHeight: 90,
          valid: true,
        },
      ],
    });
  };

  it("keeps the final, waits on what is in a block, and calls dead only what time and the search settle", () => {
    const base = record();
    expect(stepOf(base, "a").status).toBe("final");
    const classes = lineClasses(base, [missing(hash(0xa1))], tip(0));
    expect(classes.kept.map((tx) => tx.step)).toEqual(["a"]);
    expect(classes.open.map((tx) => [tx.step, tx.dead ?? false])).toEqual([
      ["b", false],
      ["c", false],
    ]);
    expect(classes.unconfirmed).toEqual([]);
    // A step a look found, whatever its status says
    expect(
      lineClasses(base, [found(hash(0xa1))], tip(0)).unconfirmed.map(
        (tx) => tx.step,
      ),
    ).toEqual(["b"]);
    // Expired, and what stands on it, after a look past the end and the margin
    const past = accept(base, {
      type: "observation",
      tip: tip(UNTIL + MARGIN),
      sightings: [missing(hash(0xa1)), found(SOURCE)] as TxSighting[],
    });
    expect(stepOf(past, "b").status).toBe("expired");
    expect(
      lineClasses(past, [], tip(UNTIL + MARGIN)).open.map((tx) => [
        tx.step,
        tx.dead ?? false,
      ]),
    ).toEqual([
      ["b", true],
      ["c", true],
    ]);
  });

  it("lets the look decide for an entry, and for a failed step", () => {
    const entries = [
      { step: "p", txHash: hash(0xb1), spends: [`${SOURCE}#2`], until: UNTIL },
      {
        step: "q",
        txHash: hash(0xb2),
        spends: [`${hash(0xb1)}#1`],
        until: UNTIL,
      },
    ];
    const base = record({ final: ["z"], open: entries });
    const kinds = (answers: LookAnswer[], at = tip(0)) => {
      const classes = lineClasses(base, answers, at);
      return {
        kept: classes.kept.map((tx) => tx.step),
        open: classes.open.map(
          (tx) =>
            `${tx.step}${tx.usedUp ? ":used" : ""}${tx.dead ? ":dead" : ""}`,
        ),
        unconfirmed: classes.unconfirmed.map((tx) => tx.step),
      };
    };
    // Found at the depth of final with scripts that passed: kept; failed: used up
    expect(
      kinds([found(hash(0xb1), { valid: true, blockHeight: 90 })]),
    ).toMatchObject({ kept: ["a", "p"], unconfirmed: [] });
    expect(kinds([found(hash(0xb1), { valid: false })]).open).toContain(
      "p:used",
    );
    // Less deep, with no depth, no slot, or no word on its scripts: unconfirmed
    for (const answer of [
      found(hash(0xb1), { valid: true, blockHeight: 99 }),
      found(hash(0xb1), { valid: true, blockHeight: undefined }),
      { txHash: hash(0xb1), found: true, valid: true },
      found(hash(0xb1)),
    ])
      expect(kinds([answer]).unconfirmed).toEqual(["p"]);
    // Not found, or no answer: open; dead past the end and the margin when the search knows
    // the chain before it, and what stands on it with it
    expect(kinds([]).open).toEqual(["b", "c", "p", "q"]);
    const late = tip(UNTIL + MARGIN);
    expect(kinds([missing(hash(0xb1)), found(SOURCE)], late).open).toEqual([
      "b",
      "c",
      "p:dead",
      "q:dead",
    ]);
    expect(kinds([missing(hash(0xb1))], late).open).toEqual([
      "b",
      "c",
      "p",
      "q",
    ]);
    expect(
      kinds([missing(hash(0xb1)), found(SOURCE)], tip(UNTIL + MARGIN - 1)).open,
    ).toEqual(["b", "c", "p", "q"]);
    // A clock behind the margin expires nothing
    expect(
      kinds([missing(hash(0xb1)), found(SOURCE)], { ...late, clockMs: 0 }).open,
    ).toEqual(["b", "c", "p", "q"]);
  });

  it("keeps in the new record the names kept and what is open and not settled", () => {
    const entries = [
      { step: "p", txHash: hash(0xb1), spends: [`${SOURCE}#2`], until: UNTIL },
      { step: "q", txHash: hash(0xb2), spends: [`${SOURCE}#3`] },
      // Settled: it spends what the kept step a spends
      { step: "s", txHash: hash(0xb3), spends: [`${SOURCE}#0`], until: UNTIL },
    ];
    const base = record({ final: ["z", "a"], open: entries });
    const classes = lineClasses(base, [], tip(0));
    expect(beforeOf(base, classes, [hash(0xa2)])).toEqual({
      final: ["z", "a"],
      open: [
        {
          step: "b",
          txHash: hash(0xa1),
          spends: [`${SOURCE}#1`],
          until: UNTIL,
        },
        entries[0],
        entries[1],
      ],
    });
    // One found in a block once keeps no end: time never settles it
    const once = { ...lineTxOf(entries[0]!), seen: { slot: 3 } };
    expect(beforeOf(base, { kept: [], open: [once] }, []).open).toEqual([
      { step: "p", txHash: hash(0xb1), spends: [`${SOURCE}#2`] },
    ]);
  });
});
