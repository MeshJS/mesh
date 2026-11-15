import type { TxEmulator } from "@meshsdk/tx-emulator";
import type { MeshWallet } from "@meshsdk/wallet";

import type {
  PlanSteps,
  StoredTxPlanJSON,
  TxPlan,
  TxPlanStore,
  Utxo,
} from "../../../src/tx-builder";
import { memoryPlanStore } from "../../../src/tx-builder";
import { ref } from "../utxo-util";
import {
  builderOf,
  emulatorOf,
  hashOf,
  submitterOf,
  walletOf,
  wrap,
} from "./plan-emulator-util";
import { seeded } from "./plan-util";
import { alice, payTo } from "./run-util";

// Two objects on one record, on a ledger that moves under them. One object makes the plan, the
// other makes it too at the same moment, or resumes it through another builder over the same
// records; the second selects from fewer of the payer's UTxOs, so that the two would build
// different bodies, and only one set of bodies may be recorded. A plan has one, two or three
// named steps. Both objects run random calls at once. Once a plan is final or stopped, the next
// rounds run a new one; a plan that stopped with a payment not made is made again from its `rest`.
// Between and during the calls time passes, someone else spends an input of a step that is not
// in a block, the plan is sometimes stopped, and the chain rolls back to a fork no deeper than the
// margin and the depth. A replayer holds every body the store ever recorded and every byte string
// a submitter held back, signs the bodies with the payer's key and submits them at random
// moments, to the chain and to its forks.
//
// After every round, for every plan run so far:
//  - the bodies of its steps are the ones of its first record, in every revision the store
//    wrote, and both objects show those bodies only;
//  - for each step, at most one transaction recorded under its name is in a block of the chain;
//    every payment of an order (a plan and the plan made again from its rest) is made at most
//    once;
//  - a terminal status (final, stopped), once an object or the store shows it, stays; so does
//    the stop mark;
//  - a final plan has every step in a block of the chain;
//  - a stopped plan has every step final or dead, no dead step in a block, and no body of a dead
//    step, replayed then or later, lands;
//  - every body a signer is handed is in a record the store wrote first, and every byte string a
//    submitter gets is the stored signed bytes of a step whose delivery the store recorded first.
//
// A failing run names its seed and prints its trace; `PLAN_RACE_SEED=<seed>` runs that seed
// alone, with the same chain and the same choices (the order in which concurrent calls finish
// may still differ). `PLAN_RACE_SEEDS` runs more seeds, `PLAN_RACE_ROUNDS` more rounds in
// each.

const SEEDS = Number(process.env.PLAN_RACE_SEEDS ?? 2);
const ROUNDS = Number(process.env.PLAN_RACE_ROUNDS ?? 8);
const ONLY_SEED = process.env.PLAN_RACE_SEED;

/** The margin, and the depth of final */
const MARGIN = 1_000;
const CONFIRMATIONS = 4;
const SLOT_MS = 1_000;
/** The deepest rollback within the design's assumptions: the margin and the depth */
const ROLLBACK_SLOTS = Math.min(Math.floor(MARGIN / SLOT_MS), CONFIRMATIONS);
const DEFAULTS = {
  ttlMs: 15_000,
  expiryMarginMs: MARGIN,
  confirmations: CONFIRMATIONS,
  pollMs: 10,
  resendMs: 10,
};
/**
 * The slot every run starts at, so that a seed gives the same transactions; its time is behind
 * the clock, as a step expires only when the tip and the clock have both passed its deadline
 */
const START_SLOT = 90_000_000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A refusal of the ledger, as a provider throws it */
const refusal = () =>
  Object.assign(new Error("refused"), { kind: "rejected", status: 400 });

/** A failure that says nothing about the outcome */
const lost = () => new Error("socket hang up");

const TERMINAL = new Set(["final", "stopped"]);
const LANDED = new Set(["included", "final"]);
const DEAD = new Set(["expired", "failed", "orphaned"]);

/** The submitters' kinds; the byte strings held back are kept for the replayer */
const KINDS = [
  "forward",
  "lossy",
  "refuseHold",
  "refuseHold",
  "hold",
  "hold",
  "refuse",
  "swallow",
  "swallow",
] as const;
type Kind = (typeof KINDS)[number];

const CALLS = [
  "sign",
  "sent",
  "sent",
  "sent",
  "included",
  "included",
  "refresh",
  "refresh",
] as const;
type Call = (typeof CALLS)[number] | "stop";

/** A move of the chain, with every choice in it drawn when the move is scheduled */
type Move =
  | { readonly kind: "advance"; readonly slots: number }
  | { readonly kind: "foreignSpend" }
  | { readonly kind: "forkPoint" }
  | {
      readonly kind: "rollback";
      readonly fork: number;
      readonly held?: number;
      readonly body?: number;
    }
  | { readonly kind: "replay"; readonly body: number }
  | { readonly kind: "replayHeld"; readonly held: number };

/** What the runs of the seeds reached, so that the coverage of the default run is checked */
const reached = {
  rollbacks: 0,
  /** Saves the store refused: two objects wrote over one revision */
  refusedSaves: 0,
  foreignSpends: 0,
  /** Plans that stopped with a step that did not land */
  stoppedShort: 0,
  /** Plans made again from the rest of a stopped plan */
  remade: 0,
  plans: 0,
};

/** One plan of a run: its id, its order, its two objects, and what the checks saw of it */
type Life = {
  readonly id: string;
  /** The order the plan pays: a plan made again from its rest pays the same order */
  readonly order: number;
  readonly X: TxPlan;
  Y?: TxPlan;
  /** Per source: the terminal status it showed first, and whether it showed the stop mark */
  readonly terminal: Map<string, string>;
  readonly stopMark: Set<string>;
  stoppedChecked?: true;
};

/** One run of a seed: its findings and its trace */
const run = async (seed: number) => {
  const random = seeded(seed);
  // The first numbers of nearby seeds are alike
  for (let i = 0; i < 8; i++) random.next();
  const chance = (p: number) => random.chance(p);
  const pick = <T>(list: readonly T[]) => random.pick(list);
  /** An item of a list known only later, by a number drawn now */
  const at = <T>(list: readonly T[], u: number) =>
    list[Math.floor(u * list.length)];
  const trace: string[] = [];
  const findings: string[] = [];
  const log = (line: string) => trace.push(line);
  const short = (hash: string) => hash.slice(0, 8);

  // The chain everyone reads and submits to, and forks kept for rollbacks
  let main: TxEmulator = await emulatorOf(START_SLOT);
  let maxSlot = main.slot;
  const forks: { chain: TxEmulator; slot: number }[] = [];
  const providers = [wrap(main), wrap(main)];
  const setMain = (chain: TxEmulator) => {
    main = chain;
    for (const provider of providers) provider.control.target = chain;
  };

  // Every body the store ever held, with the plan and the step it was recorded for; the steps of
  // each plan's first record
  const inner = memoryPlanStore();
  const bodies = new Map<string, string>();
  const recorded = new Map<string, { id: string; name: string }>();
  const firstSteps = new Map<string, string>();
  const stepsOf = (json: {
    readonly steps: readonly { name: string; txHash: string }[];
  }) => json.steps.map((step) => `${step.name}:${step.txHash}`).join(",");
  const store: TxPlanStore = {
    load: (id) => inner.load(id),
    save: async (json: StoredTxPlanJSON, expectedRev) => {
      const written = await inner.save(json, expectedRev);
      if (!written) reached.refusedSaves += 1;
      if (written) {
        const first = firstSteps.get(json.id);
        if (first === undefined) firstSteps.set(json.id, stepsOf(json));
        else if (first !== stepsOf(json))
          findings.push(
            `${json.id}: rev ${json.rev} holds the steps [${stepsOf(json)}], the first record [${first}]`,
          );
        for (const step of json.steps) {
          recorded.set(step.txHash, { id: json.id, name: step.name });
          bodies.set(step.txHash, step.tx.built.tx as string);
        }
      }
      return written;
    },
  };

  const wallet = await walletOf();
  const address = (await wallet.getChangeAddress())!;
  for (const lovelace of [60, 50, 40, 30, 25, 20, 15, 12, 10, 8])
    main.fund(address, { lovelace: BigInt(lovelace) * 1_000_000n });

  // The payer's wallet, which checks that every body it signs was recorded first
  const signer = new Proxy(wallet, {
    get(target, name, receiver) {
      if (name === "signTx")
        return async (tx: string, partial?: boolean) => {
          const txHash = await hashOf(tx);
          if (!recorded.has(txHash))
            findings.push(`a signer was handed ${short(txHash)} unrecorded`);
          return target.signTx(tx, partial);
        };
      const value = Reflect.get(target, name, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as MeshWallet;
  // Y does not select the payer's largest UTxOs, so its bodies differ from X's
  const ySelects = ({ value }: Utxo) => value.lovelace < 45_000_000n;

  // Reads the signed bytes of a stored record, with no request to the chain
  const reader = builderOf(wrap(main));
  const held: string[] = [];
  const submitter = (kind: Kind, id: string) =>
    submitterOf(async (tx) => {
      // The record as it is when the bytes are handed over
      const now = await inner.load(id);
      const txHash = await hashOf(tx);
      const step = now?.steps.find((each) => each.txHash === txHash);
      if (step === undefined || step.sends < 1)
        findings.push(
          `${short(txHash)} was submitted before its delivery was recorded`,
        );
      else if ((await reader.resume(now!)).step(step.name).signedTx !== tx)
        findings.push(
          `${short(txHash)} was submitted with bytes other than the stored ones`,
        );
      const chain = main;
      switch (kind) {
        case "forward":
          return chain.submitTx(tx);
        case "lossy":
          await chain.submitTx(tx).catch(() => undefined);
          throw lost();
        // Refused here, held by another node
        case "refuseHold":
          held.push(tx);
          throw refusal();
        // The answer is lost; the bytes wait in another mempool
        case "hold":
          held.push(tx);
          throw lost();
        case "refuse":
          throw refusal();
        case "swallow":
          return txHash;
      }
    });

  // Signs a recorded body with the payer's key and submits it
  const replay = async (chain: TxEmulator, txHash: string) => {
    try {
      await chain.submitTx(await wallet.signTx(bodies.get(txHash)!, true));
      log(`replayed ${short(txHash)} landed at slot ${chain.slot}`);
    } catch {
      // The ledger refused it
    }
  };
  const replayHeld = (chain: TxEmulator, tx: string) =>
    chain.submitTx(tx).then(
      async () => log(`held bytes ${short(await hashOf(tx))} landed`),
      () => undefined,
    );

  /** Whether a transaction is in a block of the chain, with is_valid = true */
  const inBlock = async (chain: TxEmulator, txHash: string) => {
    try {
      const info = await chain.fetchTxInfo(txHash);
      return info.validContract !== false;
    } catch {
      return false;
    }
  };

  /** The recorded transactions of a plan in a block of the chain, by the name of their step */
  const landedOn = async (chain: TxEmulator, id: string) => {
    const landed = new Map<string, string[]>();
    for (const [txHash, of] of recorded)
      if (of.id === id && (await inBlock(chain, txHash)))
        landed.set(of.name, [...(landed.get(of.name) ?? []), txHash]);
    return landed;
  };

  // Moves of the chain, made once no transaction is being checked
  const idle = async (move: () => void) => {
    for (let i = 0; i < 50; i++) {
      try {
        move();
        return;
      } catch (error) {
        if (!/being checked/.test(String((error as Error).message)))
          throw error;
        await sleep(5);
      }
    }
  };
  const advanceSlots = (slots: number) =>
    idle(() => {
      main.advanceTo({ slot: main.slot + slots });
      maxSlot = Math.max(maxSlot, main.slot);
    });

  const bX = builderOf(providers[0]!, { store, planDefaults: DEFAULTS });
  const bY = builderOf(providers[1]!, { store, planDefaults: DEFAULTS });
  const lives: Life[] = [];
  /** The payment of a step of an order: an amount no other step of the run pays */
  const amountOf = (order: number, step: number) =>
    2_000_000n + BigInt(order * 10_000 + step);
  const NAMES = ["a", "b", "c"];
  /** The steps of a new order: one, two or three payments, each a named step */
  const stepsOfOrder = (order: number): PlanSteps => {
    const count = 1 + random.int(3);
    return Object.fromEntries(
      NAMES.slice(0, count).map((name, i) => [
        name,
        payTo(alice, amountOf(order, i)),
      ]),
    );
  };
  let orders = 0;
  /** A new plan of these steps, made by X, and by Y at the same moment half the time */
  const begin = async (steps: PlanSteps, order: number) => {
    const id = `p${lives.length}`;
    const both = chance(0.5);
    const [x, y] = await Promise.allSettled([
      bX.plan(steps, { id, payer: signer }),
      both
        ? bY.plan(steps, { id, payer: signer, canSelect: ySelects })
        : Promise.resolve(undefined),
    ]);
    const X =
      x.status === "fulfilled"
        ? x.value
        : await bX.resume(id, { payer: signer });
    if (x.status === "rejected")
      log(`X.plan: ${(x.reason as { code?: string }).code ?? x.reason}`);
    if (y.status === "rejected")
      log(`Y.plan: ${(y.reason as { code?: string }).code ?? y.reason}`);
    const life: Life = {
      id,
      order,
      X,
      ...(y.status === "fulfilled" && y.value !== undefined && { Y: y.value }),
      terminal: new Map(),
      stopMark: new Set(),
    };
    lives.push(life);
    log(
      `a plan ${id} of order ${order}, steps ${X.steps.map((s) => s.name)}${both ? ", made by both" : ""}`,
    );
    return life;
  };
  let life = await begin(stepsOfOrder(orders), orders++);

  const foreignSpend = () =>
    idle(() => {
      const plan = life.X;
      const hashes = new Set(plan.steps.map((step) => step.txHash));
      const step = plan.steps.find((each) => !LANDED.has(each.status));
      const input = step?.inputs.find((each) => !hashes.has(each.txHash));
      if (!step || !input) return;
      // Spent already
      if (
        !main
          .utxos({ txHash: input.txHash })
          .some((utxo) => utxo.input.outputIndex === input.outputIndex)
      )
        return;
      main.removeUtxos([ref(input)]);
      reached.foreignSpends += 1;
      log(
        `someone else spent ${short(input.txHash)}#${input.outputIndex}, an input of ${life.id} ${step.name}`,
      );
    });
  const forkPoint = () =>
    idle(() => {
      forks.push({ chain: main.fork(), slot: main.slot });
      if (forks.length > 3) forks.shift();
    });
  const rollback = async (move: Extract<Move, { kind: "rollback" }>) => {
    const shallow = forks.filter(
      (fork) => maxSlot - fork.slot <= ROLLBACK_SLOTS,
    );
    const fork = at(shallow, move.fork);
    if (fork === undefined) return;
    // The fork may first take bytes another node held, then grows past the old chain
    const tx = move.held === undefined ? undefined : at(held, move.held);
    if (tx !== undefined) await replayHeld(fork.chain, tx);
    const body =
      move.body === undefined ? undefined : at([...bodies.keys()], move.body);
    if (body !== undefined) await replay(fork.chain, body);
    await idle(() =>
      fork.chain.advanceTo({ slot: Math.max(maxSlot, fork.chain.slot) + 1 }),
    );
    maxSlot = Math.max(maxSlot, fork.chain.slot);
    setMain(fork.chain);
    // The forks taken after this one are of the chain it replaced
    forks.splice(forks.indexOf(fork));
    reached.rollbacks += 1;
    log(`rolled back to the fork of slot ${fork.slot}, now ${main.slot}`);
  };
  const play = async (move: Move) => {
    switch (move.kind) {
      case "advance":
        return advanceSlots(move.slots);
      case "foreignSpend":
        return foreignSpend();
      case "forkPoint":
        return forkPoint();
      case "rollback":
        return rollback(move);
      case "replay": {
        const body = at([...bodies.keys()], move.body);
        return body === undefined ? undefined : replay(main, body);
      }
      case "replayHeld": {
        const tx = at(held, move.held);
        return tx === undefined ? undefined : replayHeld(main, tx);
      }
    }
  };
  /** A random move: mostly a little time, sometimes much, a rollback or a replay */
  const randomMove = (): Move => {
    const move = random.next();
    if (move < 0.25) return { kind: "advance", slots: 1 + random.int(2) };
    if (move < 0.35) return { kind: "advance", slots: 3 + random.int(10) };
    if (move < 0.42) return { kind: "foreignSpend" };
    if (move < 0.52) return { kind: "forkPoint" };
    if (move < 0.72) return rollbackMove();
    if (move < 0.88) return { kind: "replay", body: random.next() };
    return { kind: "replayHeld", held: random.next() };
  };
  const rollbackMove = (): Move => ({
    kind: "rollback",
    fork: random.next(),
    ...(chance(0.7) && { held: random.next() }),
    ...(chance(0.5) && { body: random.next() }),
  });

  const statusesOf = (plan: TxPlan) =>
    plan.steps.map((step) => `${step.name}:${step.status}`).join(" ");

  const call = async (owner: Life, who: TxPlan, name: Call, kind: Kind) => {
    const label = `${owner.id} ${who === owner.X ? "X" : "Y"}.${name}${name === "sent" || name === "included" ? `(${kind})` : ""}`;
    try {
      if (name === "sign") await who.sign({ signers: signer });
      else if (name === "sent")
        await who.run({
          waitFor: "sent",
          submitter: submitter(kind, owner.id),
          signers: signer,
        });
      else if (name === "included")
        await who.run({
          submitter: submitter(kind, owner.id),
          signers: signer,
          timeoutMs: 300,
        });
      else if (name === "refresh") await who.refresh();
      else await who.stop();
      log(`${label}: ${who.status} ${statusesOf(who)}`);
    } catch (error) {
      const code = (error as { code?: string }).code;
      log(
        `${label}: ${code ?? String(error).slice(0, 60)}, ${who.status} ${statusesOf(who)}`,
      );
    }
  };

  /** The checks of one plan after a round */
  const check = async (self: Life) => {
    const { id, X, Y, terminal, stopMark } = self;
    const landed = await landedOn(main, id);
    for (const [name, hashes] of landed)
      if (hashes.length > 1)
        findings.push(`${id} ${name}: two transactions in blocks: ${hashes}`);
    const stored = await inner.load(id);
    const first = firstSteps.get(id);
    for (const [who, plan] of [
      ["X", X],
      ["Y", Y],
    ] as const)
      if (plan !== undefined && stepsOf(plan) !== first)
        findings.push(
          `${id}: ${who} shows the steps [${stepsOf(plan)}], the first record [${first}]`,
        );
    const sources: [string, string | undefined, boolean][] = [
      ["X", X.status, X.toJSON().stopped === true],
      ["Y", Y?.status, Y?.toJSON().stopped === true],
      ["the store", stored?.status, stored?.stopped === true],
    ];
    for (const [name, status, marked] of sources) {
      const was = terminal.get(name);
      if (was !== undefined && status !== was)
        findings.push(`${id}: ${name} was ${was}, then ${status}`);
      if (was === undefined && status !== undefined && TERMINAL.has(status))
        terminal.set(name, status);
      if (stopMark.has(name) && !marked)
        findings.push(`${id}: ${name} took the stop mark back`);
      if (marked) stopMark.add(name);
    }
    if (stored === undefined) return;
    for (const step of stored.steps) {
      const on = await inBlock(main, step.txHash);
      if (stored.status === "final" && !on)
        findings.push(`${id}: final, and ${step.name} is in no block`);
      if (DEAD.has(step.status) && on)
        findings.push(`${id}: ${step.name} is ${step.status}, and in a block`);
      if (
        stored.status === "stopped" &&
        step.status !== "final" &&
        !DEAD.has(step.status)
      )
        findings.push(`${id}: stopped, and ${step.name} is ${step.status}`);
    }
    if (stored.status === "stopped" && !self.stoppedChecked) {
      self.stoppedChecked = true;
      // No body of a dead step replayed now or later may land
      for (const step of stored.steps)
        if (DEAD.has(step.status)) await replay(main, step.txHash);
      for (const tx of held) await main.submitTx(tx).catch(() => undefined);
      for (const step of stored.steps)
        if (DEAD.has(step.status) && (await inBlock(main, step.txHash)))
          findings.push(
            `${id}: stopped, then ${step.name} ${short(step.txHash)} landed`,
          );
    }
  };

  /** Each payment of each order is made at most once on the chain */
  const checkPayments = () => {
    const amounts = new Map<string, number>();
    for (const utxo of main.utxos({ address: alice })) {
      const lovelace = utxo.output.amount.find(
        (a) => a.unit === "lovelace",
      )!.quantity;
      amounts.set(lovelace, (amounts.get(lovelace) ?? 0) + 1);
    }
    for (const [lovelace, times] of amounts)
      if (times > 1)
        findings.push(
          `the payment of ${lovelace} lovelace was made ${times} times`,
        );
  };

  for (let round = 0; round < ROUNDS; round++) {
    const before = findings.length;
    if (!life.Y && round >= 1)
      life.Y = await bY
        .resume(life.id, { payer: signer })
        .catch(() => undefined);
    // A fork to roll back to within the round
    await forkPoint();
    // Calls at once, and moves of the chain at random moments among them; every third round
    // someone else spends an input of a step, and every third round the chain rolls back
    const tasks: Promise<unknown>[] = [];
    const objects = life.Y ? [life.X, life.Y] : [life.X];
    const calls = 1 + random.int(3);
    for (let i = 0; i < calls; i++) {
      const who = pick(objects);
      const name: Call = chance(0.05) ? "stop" : pick(CALLS);
      tasks.push(call(life, who, name, pick(KINDS)));
    }
    // Now and then a call on a plan that ended, which must stay as it ended
    const ended = lives.slice(0, -1);
    if (ended.length > 0 && chance(0.4)) {
      const owner = pick(ended);
      const name: Call = chance(0.1) ? "stop" : pick(CALLS);
      tasks.push(
        call(
          owner,
          pick(owner.Y ? [owner.X, owner.Y] : [owner.X]),
          name,
          pick(KINDS),
        ),
      );
    }
    const moves: Move[] = Array.from({ length: random.int(3) }, randomMove);
    if (round % 3 === 1) moves.push({ kind: "foreignSpend" });
    if (round % 3 === 2) moves.push(rollbackMove());
    for (const move of moves) {
      const delay = random.int(MARGIN + 500);
      tasks.push(sleep(delay).then(() => play(move)));
    }
    await Promise.all(tasks);
    if (chance(0.6)) await advanceSlots(1 + random.int(14));

    for (const each of lives) await check(each);
    checkPayments();
    if (findings.length > before) findings.push(`in round ${round}`);
    const stored = await inner.load(life.id);
    log(
      `round ${round}: slot ${main.slot}, ${life.id} X ${life.X.status}, Y ${life.Y?.status}, stored ${stored?.status} ${stored?.steps.map((s) => `${s.name}:${s.status}`).join(" ")}`,
    );
    // A final or stopped plan: the next rounds run a new one; a stopped one with a payment not
    // made is made again from its rest
    if (!TERMINAL.has(stored?.status ?? "")) continue;
    reached.plans += 1;
    const unpaid = stored!.steps.some((step) => step.status !== "final");
    if (stored!.status === "stopped" && unpaid) {
      reached.stoppedShort += 1;
      const rest = (await bX.resume(life.id, { payer: signer })).rest;
      if (Object.keys(rest).length > 0) {
        reached.remade += 1;
        life = await begin(rest, life.order);
        continue;
      }
    }
    life = await begin(stepsOfOrder(orders), orders++);
  }
  // Last, every body and every held byte string once more, on the chain as it is
  for (const txHash of bodies.keys()) await replay(main, txHash);
  for (const tx of held) await main.submitTx(tx).catch(() => undefined);
  for (const { id } of lives)
    for (const [name, hashes] of await landedOn(main, id))
      if (hashes.length > 1)
        findings.push(
          `${id} ${name}: two transactions in blocks at the end: ${hashes}`,
        );
  for (const each of lives) {
    const stored = await inner.load(each.id);
    for (const step of stored?.steps ?? [])
      if (DEAD.has(step.status) && (await inBlock(main, step.txHash)))
        findings.push(
          `${each.id}: ${step.name} is ${step.status}, and landed at the end`,
        );
  }
  checkPayments();
  return { findings, trace };
};

describe("Two objects on one record, with a moving chain and a replayer", () => {
  const seeds =
    ONLY_SEED !== undefined
      ? [Number(ONLY_SEED)]
      : Array.from({ length: SEEDS }, (_, i) => i + 1);
  it.each(seeds)(
    "pays at most once, keeps final and stopped, and hands out only recorded bodies: seed %i",
    async (seed) => {
      const { findings, trace } = await run(seed);
      if (findings.length > 0)
        throw new Error(
          `seed ${seed} (PLAN_RACE_SEED=${seed}): ${findings.join("; ")}\n${trace.join("\n")}`,
        );
    },
    ROUNDS * 20_000,
  );

  // The runs above are only worth something if they reach these moves
  (ONLY_SEED === undefined ? it : it.skip)(
    "reached two writers on one revision, foreign spends, rollbacks, plans stopped short and made again",
    () => {
      expect(reached.refusedSaves).toBeGreaterThan(0);
      expect(reached.rollbacks).toBeGreaterThan(0);
      expect(reached.foreignSpends).toBeGreaterThan(0);
      expect(reached.stoppedShort).toBeGreaterThan(0);
      expect(reached.remade).toBeGreaterThan(0);
      expect(reached.plans).toBeGreaterThan(0);
    },
  );
});
