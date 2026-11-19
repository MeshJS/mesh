import type { TxEmulator } from "@meshsdk/tx-emulator";
import type { MeshWallet } from "@meshsdk/wallet";
import { ProviderError } from "@meshsdk/common";

import type {
  BuildEvent,
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
// named steps. Both objects run random calls at once. Once a plan is final, the next rounds run
// a new one. At a drawn moment of a plan, and once it stopped with a payment not made, either
// object makes a plan in its place with `replan`, under one of two ids, and the next rounds run
// that one. Between and during the calls time passes, someone else spends an input of a step that
// is not in a block, the plan is sometimes stopped, the chain rolls back to a fork no deeper than
// the margin and the depth, a search hides a hash for some looks, an address is read from a fork,
// and the store answers a read with an earlier revision; now and then the first step of the plan
// not in a block lands while a step after it is open, one of the objects makes a plan in place of
// it while that step is in a block, and the chain mostly rolls back to before it landed. A
// replayer holds every body the store ever recorded and every byte string a submitter held back,
// signs the bodies with the payer's key and submits them at random moments, to the chain and to
// its forks.
//
// After every round, for every plan run so far:
//  - the bodies of its steps are the ones of its first record, in every revision the store
//    wrote, and both objects show those bodies only;
//  - for each step, at most one transaction recorded under its name is in a block of the chain;
//    a step of an order (the plans of one line) and each payment of it are made at most once,
//    unless `trace` was told NO_SHARED_INPUT for a transaction a search hid;
//  - a plan names at most one plan made in its place, and never another later; a final plan
//    names none; a record that names the plan it replaces exists only when that plan names it;
//  - a revision with that name, or with a transaction of the plans before found in a block, is
//    followed by no delivery, signature or step;
//  - a plan made in place of another holds as taken only steps that a revision of that plan
//    held in a block or final, by name and hash, and before every other step; and no step it
//    built that is no consolidation step is in a block of the chain while a taken step is not;
//  - a terminal status (final, stopped), once an object or the store shows it, stays; so does
//    the stop mark;
//  - a final plan has every step in a block of the chain;
//  - a stopped plan has every step final or dead, no dead step in a block, and no body of a dead
//    step, replayed then or later, lands, unless a search hid that step's own hash, or that of a
//    step it stands on: a look then calls it expired, or orphaned, by the provider's word, and the
//    next look that finds the hidden step makes the plan what the chain shows;
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

/** How often a round lands the first step of its plan not in a block */
const LAND = Number(process.env.PLAN_RACE_LAND ?? 0.55);

/** How often a landing is followed by a plan made in place of the plan */
const REPLAN_AFTER = Number(process.env.PLAN_RACE_REPLAN_AFTER ?? 0.9);

/** How often the plan made in place of one after a landing sees that step rolled back */
const ROLL_BACK = Number(process.env.PLAN_RACE_ROLL_BACK ?? 0.8);

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
type Call = (typeof CALLS)[number] | "stop" | "replan";

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
  | { readonly kind: "replayHeld"; readonly held: number }
  /** A search hides a recorded hash for some looks */
  | { readonly kind: "hide"; readonly body: number; readonly looks: number }
  /** The next address read of a provider answers from a fork */
  | { readonly kind: "forkRead"; readonly fork: number }
  /** The next read of the store answers with an earlier revision */
  | { readonly kind: "staleRead"; readonly back: number }
  /**
   * The first step of the plan not in a block that the ledger takes lands, while a step after it
   * stays open: the replayer's bytes of it reach a block.
   * With `replan`, one of the objects then makes a plan in place of it, under the id that
   * number picks, while the step is in a block
   */
  | {
      readonly kind: "land";
      readonly replan?: {
        readonly u: number;
        readonly y: boolean;
        readonly rollback: boolean;
      };
    };

/** What the runs of the seeds reached, so that the coverage of the default run is checked */
const reached = {
  rollbacks: 0,
  /** Saves the store refused: two objects wrote over one revision */
  refusedSaves: 0,
  foreignSpends: 0,
  /** Plans that stopped with a step that did not land */
  stoppedShort: 0,
  /** Plans made in place of another by replan */
  replaced: 0,
  /** Calls of replan refused because the plan was replaced by another id */
  replacedTwice: 0,
  /** Searches that hid a hash, address reads from a fork, store reads of an earlier revision */
  hiddenLooks: 0,
  forkReads: 0,
  staleReads: 0,
  plans: 0,
  /**
   * Plans made with a step taken from the plan before, and those whose taken step a look found
   * out of its block
   */
  takenPlans: 0,
  takenRolledBack: 0,
  /** Of those, the ones the random rounds made, apart from the closing phase */
  takenPlansInRounds: 0,
  takenRolledBackInRounds: 0,
  /** Steps that landed by the move that lands the first step not in a block */
  landed: 0,
};

/** One plan of a run: its id, its order, its two objects, and what the checks saw of it */
type Life = {
  readonly id: string;
  /** The order the plan pays: a plan made in its place pays the same order */
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
  /** Hashes a search hides, with the looks left; every hash a search ever hid */
  const hidden = new Map<string, number>();
  const everHidden = new Set<string>();
  /** The chain the next address read of a provider answers from */
  let forkReadNext: TxEmulator | undefined;
  const hooks = {
    fetchTxInfo: (forward: (hash: string) => unknown, hash: string) => {
      const left = hidden.get(hash.toLowerCase()) ?? 0;
      if (left > 0) {
        hidden.set(hash.toLowerCase(), left - 1);
        reached.hiddenLooks += 1;
        throw new ProviderError("not found", {
          kind: "notFound",
          status: 404,
          retryable: false,
        });
      }
      return forward(hash);
    },
    fetchAddressUTxOs: (
      forward: (address: string) => unknown,
      address: string,
    ) => {
      const fork = forkReadNext;
      if (fork === undefined) return forward(address);
      forkReadNext = undefined;
      reached.forkReads += 1;
      return fork.fetchAddressUTxOs(address);
    },
  };
  const providers = [wrap(main, hooks), wrap(main, hooks)];
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
  /** Every revision the store wrote, by id */
  const revisions = new Map<string, StoredTxPlanJSON[]>();
  /** How far back the next read of the store answers, when it does */
  let staleNext: number | undefined;
  const stepsOf = (json: {
    readonly steps: readonly { name: string; txHash: string }[];
  }) => json.steps.map((step) => `${step.name}:${step.txHash}`).join(",");
  const store: TxPlanStore = {
    load: async (id) => {
      const back = staleNext;
      const kept = revisions.get(id) ?? [];
      if (back !== undefined && kept.length > 1) {
        staleNext = undefined;
        reached.staleReads += 1;
        return JSON.parse(
          JSON.stringify(kept[Math.max(0, kept.length - 1 - back)]),
        ) as StoredTxPlanJSON;
      }
      return inner.load(id);
    },
    save: async (json: StoredTxPlanJSON, expectedRev) => {
      const written = await inner.save(json, expectedRev);
      if (!written) reached.refusedSaves += 1;
      if (written) {
        revisions.set(json.id, [
          ...(revisions.get(json.id) ?? []),
          JSON.parse(JSON.stringify(json)) as StoredTxPlanJSON,
        ]);
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
  const begin = async (
    steps: PlanSteps,
    order: number,
    canSelect: (utxo: Utxo) => boolean = () => true,
  ) => {
    const id = `p${lives.length}`;
    const both = chance(0.5);
    const [x, y] = await Promise.allSettled([
      bX.plan(steps, { id, payer: signer, canSelect }),
      both
        ? bY.plan(steps, {
            id,
            payer: signer,
            canSelect: (utxo) => ySelects(utxo) && canSelect(utxo),
          })
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
    await rollbackTo(fork);
  };
  /** The chain is the fork from now on, grown past the old chain */
  const rollbackTo = async (fork: { chain: TxEmulator; slot: number }) => {
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
      case "hide": {
        const body = at([...bodies.keys()], move.body);
        if (body === undefined) return;
        hidden.set(body, move.looks);
        everHidden.add(body);
        log(`a search hides ${short(body)} for ${move.looks} looks`);
        return;
      }
      case "forkRead": {
        const fork = at(forks, move.fork);
        if (fork !== undefined) forkReadNext = fork.chain;
        return;
      }
      case "staleRead":
        staleNext = move.back;
        return;
      case "land": {
        const stored = await inner.load(life.id);
        // A fork of the chain before the step lands, to roll back to
        let point: { chain: TxEmulator; slot: number } | undefined;
        await idle(() => {
          point = { chain: main.fork(), slot: main.slot };
          forks.push(point);
          if (forks.length > 3) forks.shift();
        });
        // The first step, in order, that is not in a block and that the ledger takes now, with
        // a step after it left to pay
        let step: { name: string; txHash: string } | undefined;
        const open = (stored?.steps ?? []).filter(
          (each) => !LANDED.has(each.status) && !DEAD.has(each.status),
        );
        for (const each of open.slice(0, -1)) {
          if (await inBlock(main, each.txHash)) continue;
          await replay(main, each.txHash);
          if (await inBlock(main, each.txHash)) {
            step = each;
            break;
          }
        }
        if (step === undefined) return;
        reached.landed += 1;
        log(`${life.id} ${step.name} ${short(step.txHash)} landed`);
        if (
          move.replan !== undefined &&
          successors.get(life.id) === undefined
        ) {
          const owner = life;
          const who =
            move.replan.y && owner.Y !== undefined ? owner.Y : owner.X;
          await call(owner, who, "replan", "forward", move.replan.u);
          // The block of that step rolled back under the plan made in place of it
          if (
            move.replan.rollback &&
            point !== undefined &&
            forks.includes(point) &&
            maxSlot - point.slot <= ROLLBACK_SLOTS
          ) {
            await rollbackTo(point);
            // A look of the plan made in place of it, which finds the step out of its block
            const next = lives.find(
              (each) => each.id === successors.get(owner.id),
            );
            if (next !== undefined)
              await call(next, next.X, "refresh", "forward", 0);
          }
        }
        return;
      }
    }
  };
  /** A random move: mostly a little time, sometimes much, a rollback or a replay */
  const randomMove = (): Move => {
    const move = random.next();
    if (move < 0.22) return { kind: "advance", slots: 1 + random.int(2) };
    if (move < 0.3) return { kind: "advance", slots: 3 + random.int(10) };
    if (move < 0.36) return { kind: "foreignSpend" };
    if (move < 0.44) return { kind: "forkPoint" };
    if (move < 0.6) return rollbackMove();
    if (move < 0.72) return { kind: "replay", body: random.next() };
    if (move < 0.8) return { kind: "replayHeld", held: random.next() };
    if (move < 0.9)
      return { kind: "hide", body: random.next(), looks: 1 + random.int(6) };
    if (move < 0.95) return { kind: "forkRead", fork: random.next() };
    return { kind: "staleRead", back: 1 + random.int(3) };
  };
  /** The plans the closing phase made: the random rounds are counted apart from them */
  const closing = new Set<string>();
  const rollbackMove = (): Move => ({
    kind: "rollback",
    fork: random.next(),
    ...(chance(0.7) && { held: random.next() }),
    ...(chance(0.5) && { body: random.next() }),
  });

  const statusesOf = (plan: TxPlan) =>
    plan.steps.map((step) => `${step.name}:${step.status}`).join(" ");

  /** The NO_SHARED_INPUT warnings of the plans of each order, by hash */
  const noShared = new Map<number, Set<string>>();
  const traceOf = (order: number) => (event: BuildEvent) => {
    if (event.type !== "warning" || event.code !== "NO_SHARED_INPUT") return;
    noShared.set(order, (noShared.get(order) ?? new Set()).add(event.txHash));
    log(`order ${order}: NO_SHARED_INPUT for ${short(event.txHash)}`);
  };
  /** The plan made in place of each plan, by id */
  const successors = new Map<string, string>();
  /** The life of a plan made in place of `owner`: a new one, or the one of that id */
  const adopt = (owner: Life, plan: TxPlan): Life => {
    successors.set(owner.id, plan.id!);
    const known = lives.find((each) => each.id === plan.id);
    if (known !== undefined) {
      if (known.Y === undefined && known.X !== plan) known.Y = plan;
      return known;
    }
    reached.replaced += 1;
    const next: Life = {
      id: plan.id!,
      order: owner.order,
      X: plan,
      terminal: new Map(),
      stopMark: new Set(),
    };
    lives.push(next);
    log(
      `${plan.id} in place of ${owner.id}: steps ${plan.steps.map((s) => s.name)}`,
    );
    return next;
  };
  /** One of the two ids of a plan made in place of `owner`, by a number drawn before */
  const replanId = (owner: Life, u: number) =>
    `${owner.id}.${u < 0.5 ? "x" : "y"}`;

  const call = async (
    owner: Life,
    who: TxPlan,
    name: Call,
    kind: Kind,
    u: number,
  ) => {
    const label = `${owner.id} ${who === owner.X ? "X" : "Y"}.${name}${name === "sent" || name === "included" ? `(${kind})` : ""}`;
    try {
      if (name === "replan") {
        const next = await who.replan({
          id: replanId(owner, u),
          trace: traceOf(owner.order),
        });
        adopt(owner, next);
      } else if (name === "sign") await who.sign({ signers: signer });
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
      if (name === "replan" && who.replacedBy !== undefined)
        reached.replacedTwice += 1;
      log(
        `${label}: ${code ?? String(error).slice(0, 60)}, ${who.status} ${statusesOf(who)}`,
      );
    }
  };

  type StoredStep = {
    readonly name: string;
    readonly txHash: string;
    readonly standsOn?: readonly string[];
  };
  /**
   * Whether a search hid this step's own hash, or that of a step it stands on, all the way down:
   * past its end and the margin a look then calls it expired, or orphaned, as the provider's word
   * is all a look has, and the next look that finds it makes it what the chain shows. Payments
   * are checked all the same
   */
  const hiddenBelow = (
    stored: { readonly steps: readonly StoredStep[] },
    step: StoredStep,
    met = new Set<string>(),
  ): boolean => {
    if (everHidden.has(step.txHash)) return true;
    if (met.has(step.name)) return false;
    met.add(step.name);
    return (step.standsOn ?? []).some((name) => {
      const below = stored.steps.find((each) => each.name === name);
      return below !== undefined && hiddenBelow(stored, below, met);
    });
  };
  /** Whether a step of the record is one `hiddenBelow` answers for */
  const liedTo = (stored: { readonly steps: readonly StoredStep[] }) =>
    stored.steps.some((step) => hiddenBelow(stored, step));

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
      // A stopped plan with a step a search hid comes to final once a look finds that step
      const cameBack =
        was === "stopped" &&
        status === "final" &&
        stored !== undefined &&
        liedTo(stored);
      if (was !== undefined && status !== was && !cameBack)
        findings.push(`${id}: ${name} was ${was}, then ${status}`);
      if (cameBack) terminal.set(name, "final");
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
      if (DEAD.has(step.status) && on && !hiddenBelow(stored, step))
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
        if (
          DEAD.has(step.status) &&
          !hiddenBelow(stored, step) &&
          (await inBlock(main, step.txHash))
        )
          findings.push(
            `${id}: stopped, then ${step.name} ${short(step.txHash)} landed`,
          );
    }
  };

  /**
   * Each payment of each order is made at most once on the chain, unless `trace` was told
   * NO_SHARED_INPUT, for a plan of that order, of a transaction a search hid
   */
  const checkPayments = () => {
    const amounts = new Map<string, number>();
    for (const utxo of main.utxos({ address: alice })) {
      const lovelace = utxo.output.amount.find(
        (a) => a.unit === "lovelace",
      )!.quantity;
      amounts.set(lovelace, (amounts.get(lovelace) ?? 0) + 1);
    }
    for (const [lovelace, times] of amounts) {
      if (times < 2) continue;
      const order = Math.floor((Number(lovelace) - 2_000_000) / 10_000);
      const told = [...(noShared.get(order) ?? [])].some((txHash) =>
        everHidden.has(txHash),
      );
      if (told) log(`the payment of ${lovelace} was made ${times} times, told`);
      else
        findings.push(
          `the payment of ${lovelace} lovelace was made ${times} times`,
        );
    }
  };

  /**
   * Over every revision the store wrote: a plan names at most one plan made in its place and
   * never another later, and a final one is never given a name; a record that names the plan it
   * replaces exists only while that plan names it; a revision with that name, or with a
   * transaction of the plans before found in a block, is followed by no delivery, signature or
   * step
   */
  const checkLines = async () => {
    for (const [id, kept] of revisions) {
      let named: string | undefined;
      let closed: StoredTxPlanJSON | undefined;
      let previous: StoredTxPlanJSON | undefined;
      for (const json of kept) {
        if (named !== undefined && json.replacedBy !== named)
          findings.push(
            `${id}: rev ${json.rev} names ${json.replacedBy}, and an earlier one ${named}`,
          );
        if (
          previous?.status === "final" &&
          previous.replacedBy === undefined &&
          json.replacedBy !== undefined
        )
          findings.push(`${id}: final, then named ${json.replacedBy}`);
        named ??= json.replacedBy;
        if (closed !== undefined) {
          const was = closed.steps.map(
            (step) => `${step.name}:${step.sends}:${step.tx.witnesses ?? ""}`,
          );
          const now = json.steps.map(
            (step) => `${step.name}:${step.sends}:${step.tx.witnesses ?? ""}`,
          );
          if (was.join(",") !== now.join(","))
            findings.push(
              `${id}: rev ${json.rev} took a delivery, a signature or a step after rev ${closed.rev} closed it`,
            );
        } else if (
          json.replacedBy !== undefined ||
          json.before?.open.some((entry) => entry.seen !== undefined)
        )
          closed = json;
        previous = json;
      }
      const replaces = kept[0]?.replaces;
      if (
        replaces !== undefined &&
        (await inner.load(replaces))?.replacedBy !== id
      )
        findings.push(`${id} replaces ${replaces}, which does not name it`);
      if (replaces !== undefined) await checkTaken(id, kept, replaces);
    }
  };

  /** Plans seen with a taken step, and with one found out of its block */
  const takenSeen = new Set<string>();
  const takenOut = new Set<string>();
  /**
   * A plan made in place of `replaces` takes only steps that a revision of that plan held in a
   * block or final, under the same name and hash, and they come first; a step of its first record
   * that it built, no consolidation step, is in a block of the chain only if every taken step is
   */
  const checkTaken = async (
    id: string,
    kept: readonly StoredTxPlanJSON[],
    replaces: string,
  ) => {
    const first = kept[0]!;
    const taken = first.steps.filter((step) => step.taken === true);
    if (taken.length === 0) return;
    if (!takenSeen.has(id)) {
      takenSeen.add(id);
      reached.takenPlans += 1;
      if (!closing.has(id)) reached.takenPlansInRounds += 1;
    }
    const count = first.steps.findIndex((step) => step.taken !== true);
    if (count >= 0 && count < taken.length)
      findings.push(`${id}: a taken step comes after a step that is not taken`);
    const was = revisions.get(replaces) ?? [];
    for (const step of taken)
      if (
        !was.some((json) =>
          json.steps.some(
            (each) =>
              each.name === step.name &&
              each.txHash === step.txHash &&
              LANDED.has(each.status),
          ),
        )
      )
        findings.push(
          `${id}: took ${step.name} ${short(step.txHash)}, which no revision of ${replaces} held in a block`,
        );
    if (
      !takenOut.has(id) &&
      kept.some((json) =>
        json.steps.some(
          (step) => step.taken === true && step.status === "sent",
        ),
      )
    ) {
      takenOut.add(id);
      reached.takenRolledBack += 1;
      if (!closing.has(id)) reached.takenRolledBackInRounds += 1;
    }
    const onChain = await Promise.all(
      taken.map((step) => inBlock(main, step.txHash)),
    );
    if (onChain.every(Boolean)) return;
    for (const step of first.steps)
      if (
        step.taken !== true &&
        step.kind !== "consolidation" &&
        (await inBlock(main, step.txHash))
      )
        findings.push(
          `${id}: ${step.name} is in a block while a taken step is in none`,
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
      const name: Call = chance(0.05)
        ? "stop"
        : chance(0.08)
          ? "replan"
          : pick(CALLS);
      tasks.push(call(life, who, name, pick(KINDS), random.next()));
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
          random.next(),
        ),
      );
    }
    const moves: Move[] = Array.from({ length: random.int(3) }, randomMove);
    // The first step of the plan not in a block lands now and then while the calls go on
    if (chance(LAND))
      moves.push({
        kind: "land",
        ...(chance(REPLAN_AFTER) && {
          replan: {
            u: random.next(),
            y: chance(0.5),
            rollback: chance(ROLL_BACK),
          },
        }),
      });
    if (round % 3 === 1) moves.push({ kind: "foreignSpend" });
    if (round % 3 === 2) moves.push(rollbackMove());
    for (const move of moves) {
      const delay = random.int(MARGIN + 500);
      tasks.push(sleep(delay).then(() => play(move)));
    }
    await Promise.all(tasks);
    if (chance(0.6)) await advanceSlots(1 + random.int(14));

    for (const each of lives) await check(each);
    await checkLines();
    checkPayments();
    if (findings.length > before) findings.push(`in round ${round}`);
    const stored = await inner.load(life.id);
    log(
      `round ${round}: slot ${main.slot}, ${life.id} X ${life.X.status}, Y ${life.Y?.status}, stored ${stored?.status} ${stored?.steps.map((s) => `${s.name}:${s.status}`).join(" ")}`,
    );
    // A plan made in place of this one: the next rounds run it. A final or stopped plan: the
    // next rounds run a new one; a stopped one with a payment not made is replaced
    const successor = successors.get(life.id);
    if (successor !== undefined) {
      life = lives.find((each) => each.id === successor)!;
      continue;
    }
    if (!TERMINAL.has(stored?.status ?? "")) continue;
    reached.plans += 1;
    const unpaid = stored!.steps.some((step) => step.status !== "final");
    if (stored!.status === "stopped" && unpaid) {
      reached.stoppedShort += 1;
      const who = life.Y !== undefined && chance(0.5) ? life.Y : life.X;
      const id = replanId(life, random.next());
      try {
        life = adopt(
          life,
          await who.replan({ id, trace: traceOf(life.order) }),
        );
        continue;
      } catch (error) {
        const code = (error as { code?: string; retryable?: boolean }).code;
        log(`${life.id}.replan(${id}) at the end of the round: ${code}`);
        // Retryable: the next rounds go on with this plan and try again
        if ((error as { retryable?: boolean }).retryable === true) continue;
      }
    }
    life = await begin(stepsOfOrder(orders), orders++);
  }
  // Then a plan of a new order whose first step lands is replaced while that step is in a block
  // and not final, and the chain rolls back under it; both plans go on, a replayer at work, and
  // the checks of every round apply to them
  {
    // Two payments, so that one is left beside the step in a block
    const pair = Object.fromEntries(
      NAMES.slice(0, 2).map((name, i) => [
        name,
        payTo(alice, amountOf(orders, i)),
      ]),
    );
    // Funds of its own: what the wallet held before, which earlier orders spend or read, is
    // not selected
    const earlier = new Set<string>();
    await idle(() => {
      for (const utxo of main.utxos({ address }))
        earlier.add(`${utxo.input.txHash}#${utxo.input.outputIndex}`);
      for (const lovelace of [30_000_000n, 20_000_000n])
        main.fund(address, { lovelace });
    });
    const owner = await begin(
      pair,
      orders++,
      (utxo) => !earlier.has(`${utxo.txHash}#${utxo.outputIndex}`),
    );
    await forkPoint();
    await call(owner, owner.X, "sign", "forward", 0);
    await call(owner, owner.X, "sent", "forward", 0);
    await call(owner, owner.X, "refresh", "forward", 0);
    await call(owner, owner.X, "replan", "forward", random.next());
    const id = successors.get(owner.id);
    if (id !== undefined) closing.add(id);
    const next = lives.find((each) => each.id === id);
    await rollback({ kind: "rollback", fork: 0.999 });
    if (next !== undefined)
      for (const name of ["refresh", "included", "included"] as const) {
        await call(next, next.X, name, "forward", 0);
        await advanceSlots(1 + random.int(5));
      }
    for (const each of lives) await check(each);
    await checkLines();
    checkPayments();
    // Each seed reaches the case: a plan with a taken step, and that step out of its block
    if (id === undefined || !takenSeen.has(id))
      findings.push("the closing phase made no plan with a taken step");
    else if (!takenOut.has(id))
      findings.push("the closing phase saw no rollback of its taken step");
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
      if (
        DEAD.has(step.status) &&
        !hiddenBelow(stored!, step) &&
        (await inBlock(main, step.txHash))
      )
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
    "reached two writers on one revision, foreign spends, rollbacks, hidden searches, plans stopped short and plans in place of others",
    () => {
      expect(reached.refusedSaves).toBeGreaterThan(0);
      expect(reached.rollbacks).toBeGreaterThan(0);
      expect(reached.foreignSpends).toBeGreaterThan(0);
      expect(reached.stoppedShort).toBeGreaterThan(0);
      expect(reached.replaced).toBeGreaterThan(0);
      expect(reached.hiddenLooks).toBeGreaterThan(0);
      expect(reached.plans).toBeGreaterThan(0);
      expect(reached.takenPlans).toBeGreaterThan(0);
      expect(reached.takenRolledBack).toBeGreaterThan(0);
      expect(reached.takenPlansInRounds).toBeGreaterThan(0);
      expect(reached.takenRolledBackInRounds).toBeGreaterThan(0);
      console.log(`reached: ${JSON.stringify(reached)}`);
    },
  );
});
