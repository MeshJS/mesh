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
    outputs: Array.from({ length: OUTPUTS }, (_, i) => utxo(txHash, i)),
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
 * A ledger of small worlds
 * ------------------------------------------------------------------------------------------- */

/** The regular outputs of every transaction of a world; the collateral return is the next */
const OUTPUTS = 2;
const ref = (txHash: string, index: number) => `${txHash}#${index}`;
const lower = (outRef: string) => {
  const at = outRef.indexOf("#");
  return `${outRef.slice(0, at).toLowerCase()}${outRef.slice(at)}`;
};

/** The part a transaction of a world plays for the rule */
type Role = "made" | "earlier" | "openStep" | "openEntry" | "kept" | "usedUp";

/** A transaction of a world: what it spends, reads and puts up, and whether its scripts fail */
type WorldTx = {
  readonly name: string;
  readonly txHash: string;
  readonly spends: readonly string[];
  readonly reads: readonly string[];
  readonly putUp: readonly string[];
  readonly fails: boolean;
  readonly role: Role;
  readonly consolidation?: true;
};

const split = (outRef: string): [string, number] => {
  const at = outRef.indexOf("#");
  return [outRef.slice(0, at), Number(outRef.slice(at + 1))];
};

const asStep = (tx: WorldTx): StepTx =>
  step(
    tx.name,
    body(tx.txHash, tx.spends.map(split), {
      reads: tx.reads.map(split),
      ...(tx.putUp.length > 0 && { collateral: tx.putUp.map(split) }),
    }),
    tx.consolidation ? "consolidation" : undefined,
  );

const asOpen = (tx: WorldTx): LineInput =>
  tx.role === "openEntry"
    ? ({
        step: tx.name,
        txHash: tx.txHash.toLowerCase(),
        spends: tx.spends.map(lower),
        outputs: OUTPUTS,
      } satisfies BeforeEntry)
    : tx.role === "usedUp"
      ? { ...lineTxOf(asStep(tx)), usedUp: true }
      : asStep(tx);

const shuffled = <T>(r: Random, items: readonly T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const k = r.int(i + 1);
    [copy[i], copy[k]] = [copy[k]!, copy[i]!];
  }
  return copy;
};

/** What landed on a chain, and how: its scripts passed, or failed */
type Landed = ReadonlyMap<string, "valid" | "failed">;

/**
 * Every chain of a world, from the out refs that exist before it: a transaction lands when every
 * out ref it spends, reads or puts up exists unspent; with scripts that pass it spends its
 * inputs and makes its regular outputs, with scripts that fail it spends what it puts up alone
 * and makes its collateral return; a hash lands once
 */
const chainsOf = (genesis: readonly string[], txs: readonly WorldTx[]) => {
  type State = { unspent: ReadonlySet<string>; landed: Landed };
  const keyOf = (state: State) =>
    `${[...state.landed].map(([h, m]) => `${h}:${m}`).sort()}|${[...state.unspent].sort()}`;
  const met = new Set<string>();
  const out: Landed[] = [];
  const stack: State[] = [
    { unspent: new Set(genesis.map(lower)), landed: new Map() },
  ];
  while (stack.length > 0) {
    const state = stack.pop()!;
    const key = keyOf(state);
    if (met.has(key)) continue;
    met.add(key);
    out.push(state.landed);
    for (const tx of txs) {
      const txHash = tx.txHash.toLowerCase();
      if (state.landed.has(txHash)) continue;
      if (
        ![...tx.spends, ...tx.reads, ...tx.putUp].every((each) =>
          state.unspent.has(lower(each)),
        )
      )
        continue;
      if (tx.fails && tx.putUp.length === 0) continue;
      const unspent = new Set(state.unspent);
      const landed = new Map(state.landed);
      if (tx.fails) {
        for (const each of tx.putUp) unspent.delete(lower(each));
        unspent.add(ref(txHash, OUTPUTS));
        landed.set(txHash, "failed");
      } else {
        for (const each of tx.spends) unspent.delete(lower(each));
        for (let i = 0; i < OUTPUTS; i++) unspent.add(ref(txHash, i));
        landed.set(txHash, "valid");
      }
      stack.push({ unspent, landed });
    }
  }
  return out;
};

/**
 * A random world: out refs that exist before it, and transactions of every role, each spending,
 * reading or putting up out refs of those before it, regular outputs and collateral returns
 * alike; a fifth of them fail their scripts
 */
const randomWorld = (r: Random) => {
  const genesis = Array.from({ length: 2 + r.int(4) }, (_, i) =>
    ref(hash(0x900 + i), r.int(2)),
  );
  const refs = [...genesis];
  const roles: Role[] = [
    "made",
    "made",
    "earlier",
    "openStep",
    "openEntry",
    "openStep",
    "kept",
    "usedUp",
  ];
  const world: WorldTx[] = [];
  for (let i = 0; i < 3 + r.int(4); i++) {
    const role = r.pick(roles);
    const fails = role === "usedUp" || (role !== "kept" && r.chance(0.2));
    const txHash = r.chance(0.2)
      ? hash(0xe00 + i).toUpperCase()
      : hash(0xe00 + i);
    const spends = Array.from(
      new Set(Array.from({ length: 1 + r.int(2) }, () => r.pick(refs))),
    ).map((each) => (r.chance(0.15) ? each.toUpperCase() : each));
    world.push({
      name: `t${i}`,
      txHash,
      spends,
      reads: r.chance(0.25) ? [r.pick(refs)] : [],
      putUp: fails || r.chance(0.2) ? [r.pick(refs)] : [],
      fails,
      role,
      ...(role === "made" && r.chance(0.1) && { consolidation: true as const }),
    });
    for (let k = 0; k < OUTPUTS; k++) refs.push(ref(txHash.toLowerCase(), k));
    if (fails) refs.push(ref(txHash.toLowerCase(), OUTPUTS));
  }
  return { genesis, world };
};

/**
 * What the rule says of a world against what its chains show: a pair of a made step and an open
 * transaction called apart, or an open transaction called settled, of which one chain lands
 * both with scripts that pass (unsound); and how many pairs it returns that one chain lands
 */
const judge = (genesis: readonly string[], world: readonly WorldTx[]) => {
  const of = (...roles: Role[]) =>
    world.filter((tx) => roles.includes(tx.role));
  const made = of("made");
  const open = of("openStep", "openEntry", "usedUp");
  const kept = of("kept");
  const usedUp = of("usedUp");
  const valid = (chain: Landed, tx: WorldTx) =>
    chain.get(tx.txHash.toLowerCase()) === "valid";
  const chains = chainsOf(genesis, world).filter(
    (chain) =>
      kept.every((tx) => valid(chain, tx)) &&
      usedUp.every((tx) => chain.get(tx.txHash.toLowerCase()) === "failed"),
  );
  const unsound: string[] = [];
  let returnedLanding = 0;
  if (chains.length === 0) return { worlds: 0, unsound, returnedLanding };
  const answer = landsBeside(
    made.map(asStep),
    open.map(asOpen),
    kept.map(asStep),
    of("earlier").map(asStep),
  );
  const returned = new Set(
    answer.flatMap(({ step: t, open: rs }) =>
      rs.map((each) => `${lineTxOf(t).step}|${lineTxOf(each).step}`),
    ),
  );
  const hashes = (txs: readonly WorldTx[]) =>
    new Set(txs.map((tx) => tx.txHash.toLowerCase()));
  const openHashes = hashes(open);
  const madeHashes = hashes(made);
  for (const t of made) {
    if (t.consolidation || openHashes.has(t.txHash.toLowerCase())) continue;
    for (const o of open) {
      if (madeHashes.has(o.txHash.toLowerCase())) continue;
      const both = chains.some((chain) => valid(chain, t) && valid(chain, o));
      if (returned.has(`${t.name}|${o.name}`)) {
        if (both) returnedLanding++;
      } else if (both) unsound.push(`${t.name} and ${o.name} called apart`);
    }
  }
  for (const each of settled(open.map(asOpen), kept.map(asStep))) {
    const name = lineTxOf(each).step;
    const o = open.find((tx) => tx.name === name)!;
    if (chains.some((chain) => valid(chain, o)))
      unsound.push(`${name} called settled`);
  }
  return { worlds: 1, unsound, returnedLanding };
};

/* ---------------------------------------------------------------------------------------------
 * The pairs
 * ------------------------------------------------------------------------------------------- */

describe("landsBeside", () => {
  it("keeps apart only what no chain holds together", () => {
    const SEEDS = 20_000;
    let worlds = 0;
    let returnedLanding = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = seeded(Math.imul(seed, 0x9e3779b1) >>> 0);
      const { genesis, world } = randomWorld(r);
      const found = judge(genesis, world);
      if (found.unsound.length > 0)
        throw new Error(
          `seed ${seed}: ${found.unsound.join(", ")}: ${JSON.stringify(world)}`,
        );
      worlds += found.worlds;
      returnedLanding += found.returnedLanding;
    }
    expect(worlds).toBeGreaterThan(10_000);
    expect(returnedLanding).toBeGreaterThan(3_000);
  });

  it("calls able to land what stands on a collateral return, which exists only when scripts failed", () => {
    const g0 = ref(hash(0xa0), 0);
    const g1 = ref(hash(0xa1), 0);
    const g2 = ref(hash(0xa2), 0);
    const U = hash(0xb1);
    const u = (role: Role): WorldTx => ({
      name: "u",
      txHash: U,
      spends: [g0],
      reads: [],
      putUp: [g1],
      fails: true,
      role,
    });
    const tx = (name: string, role: Role, spends: string[]): WorldTx => ({
      name,
      txHash: name === "T" ? hash(0xc1) : hash(0xd1),
      spends,
      reads: [],
      putUp: [],
      fails: false,
      role,
    });
    // An earlier step of the plan landed failed; the step added spends its collateral return; an
    // entry spends what the earlier step's inputs were
    const added = [
      u("earlier"),
      tx("T", "made", [ref(U, OUTPUTS)]),
      tx("r", "openEntry", [g0]),
    ];
    // An old step on the collateral return of a used-up one is not settled by it
    const onUsedUp = [
      u("usedUp"),
      tx("r", "openStep", [ref(U, OUTPUTS)]),
      tx("T", "made", [g2]),
    ];
    // A guard taken from an input of a step that lands failed keeps nothing on its collateral
    // return apart
    const guarded = [
      u("openStep"),
      tx("r", "openStep", [ref(U, OUTPUTS)]),
      tx("T", "made", [g0]),
    ];
    for (const [genesis, world] of [
      [[g0, g1], added],
      [[g0, g1, g2], onUsedUp],
      [[g0, g1], guarded],
    ] as const) {
      expect(judge(genesis, world).unsound).toEqual([]);
      expect(judge(genesis, world).returnedLanding).toBe(1);
    }
    // And r is a root of its own, with its own guard
    const roots = rootGuards(
      guarded.filter((x) => x.role !== "made").map(asOpen),
      new Map(),
      [],
    );
    expect(roots.roots.map((each) => each.root.step)).toEqual(["u", "r"]);
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
      outputs: 2,
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
      outputs: OUTPUTS,
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
      outputs: 2,
    };
    const lone: BeforeEntry = {
      step: "f",
      txHash: hash(0x17),
      spends: [`${Y}#0`],
      outputs: 2,
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

  /** A body of two regular outputs */
  const withOutputs = (built: BuiltTxData): BuiltTxData => ({
    ...built,
    outputs: [utxo(built.txHash, 0), utxo(built.txHash, 1)],
  });

  /** A plan of a final step a, a sent step b on X, and c on the change of b */
  const record = (before?: PlanRecord["before"]) => {
    const steps = [
      {
        name: "a",
        built: withOutputs(
          stepTx({
            txHash: hash(0xa0),
            inputs: [utxo(SOURCE)],
            until: UNTIL,
          }),
        ),
        standsOn: [],
      },
      {
        name: "b",
        built: withOutputs(
          stepTx({
            txHash: hash(0xa1),
            inputs: [utxo(SOURCE, 1)],
            until: UNTIL,
          }),
        ),
        standsOn: [],
      },
      {
        name: "c",
        built: withOutputs(
          stepTx({
            txHash: hash(0xa2),
            inputs: [utxo(hash(0xa1), 1)],
            until: UNTIL,
          }),
        ),
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
    const deadOf = (answers: LookAnswer[]) =>
      lineClasses(past, answers, tip(UNTIL + MARGIN)).open.map((tx) => [
        tx.step,
        tx.dead ?? false,
      ]);
    expect(deadOf([missing(hash(0xa1))])).toEqual([
      ["b", true],
      ["c", true],
    ]);
    // Without an answer of this look, as from a search that failed, it is not dead
    expect(deadOf([])).toEqual([
      ["b", false],
      ["c", false],
    ]);
  });

  it("lets the look decide for an entry, and for a failed step", () => {
    const entries = [
      {
        step: "p",
        txHash: hash(0xb1),
        spends: [`${SOURCE}#2`],
        outputs: 2,
        until: UNTIL,
      },
      {
        step: "q",
        txHash: hash(0xb2),
        spends: [`${hash(0xb1)}#1`],
        outputs: 2,
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
    // Less deep, with no depth or no slot: unconfirmed
    for (const answer of [
      found(hash(0xb1), { valid: true, blockHeight: 99 }),
      found(hash(0xb1), { valid: true, blockHeight: undefined }),
      { txHash: hash(0xb1), found: true, valid: true },
    ])
      expect(kinds([answer]).unconfirmed).toEqual(["p"]);
    // No word on its scripts: passed for a transaction that runs no Plutus script, and no
    // validity to be had for one that runs one
    expect(kinds([found(hash(0xb1), { blockHeight: 90 })])).toMatchObject({
      kept: ["a", "p"],
      unconfirmed: [],
    });
    const plutus = record({
      final: ["z"],
      open: [{ ...entries[0]!, plutus: true as const }, entries[1]!],
    });
    expect(
      lineClasses(
        plutus,
        [found(hash(0xb1), { blockHeight: 90 })],
        tip(0),
      ).noValidity.map((tx) => tx.step),
    ).toEqual(["p"]);
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
      {
        step: "p",
        txHash: hash(0xb1),
        spends: [`${SOURCE}#2`],
        outputs: 2,
        until: UNTIL,
      },
      { step: "q", txHash: hash(0xb2), spends: [`${SOURCE}#3`], outputs: 2 },
      // Settled: it spends what the kept step a spends
      {
        step: "s",
        txHash: hash(0xb3),
        spends: [`${SOURCE}#0`],
        outputs: 2,
        until: UNTIL,
      },
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
          outputs: 2,
          pays: [utxo(hash(0xa1)).address],
          until: UNTIL,
        },
        entries[0],
        entries[1],
      ],
    });
    // One found in a block once keeps no end, and the next plan knows it was found: time never
    // settles it, however many plans on
    const once = { ...lineTxOf(entries[0]!), seen: { slot: 3 } };
    const carried = beforeOf(base, { kept: [], open: [once] }, []);
    expect(carried.open).toEqual([
      {
        step: "p",
        txHash: hash(0xb1),
        spends: [`${SOURCE}#2`],
        outputs: 2,
        seenBefore: { slot: 3 },
      },
    ]);
    // Two plans on, what stands on a dead one is not dead when it was found once
    const D = hash(0xd0);
    const E = hash(0xe0);
    const n = record({
      final: [],
      open: [
        { step: "d", txHash: D, spends: [`${SOURCE}#5`], outputs: 2, until: 1 },
        {
          step: "e",
          txHash: E,
          spends: [`${D}#0`],
          outputs: 2,
          seen: { slot: 50 },
        },
      ],
    });
    const late = tip(UNTIL + MARGIN);
    const answers = [missing(D), missing(E), found(SOURCE)];
    const inN = lineClasses(n, answers, late);
    const m = record({ final: [], open: [...beforeOf(n, inN, []).open] });
    const inM = lineClasses(m, answers, late).open;
    expect(inM.find((tx) => tx.step === "d")?.dead).toBe(true);
    expect(inM.find((tx) => tx.step === "e")?.dead).toBeUndefined();
  });
});
