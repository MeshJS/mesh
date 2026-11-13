import type { UTxO } from "@meshsdk/common";
import type { TxEmulator } from "@meshsdk/tx-emulator";
import type { MeshWallet } from "@meshsdk/wallet";

import type {
  StoredTxIntentJSON,
  TxIntent,
  TxIntentStore,
} from "../../../src/tx-builder";
import { memoryIntentStore } from "../../../src/tx-builder";
import { recordOf } from "../../../src/tx-builder/intent/intent";
import {
  builderOf,
  emulatorOf,
  hashOf,
  pay,
  submitterOf,
  walletOf,
  wrap,
} from "./intent-emulator-util";
import { seeded } from "./intent-util";

// Two objects on one record, on a ledger that moves under them. One object makes the intent, the
// other makes it too or resumes it through another builder over the same records, and selects
// from fewer of the payer's UTxOs, so that the two may build different bodies; both run random
// calls at once. Once an intent is final or abandoned, the next rounds run a new one. Between and
// during the calls time passes, someone else spends the payer's anchor, and the chain rolls back
// to a fork no deeper than the margin and the depth. A replayer holds every body the store ever
// recorded and every byte string a submitter held back, signs the bodies with the payer's key and
// submits them at random moments, to the chain and to its forks.
//
// After every round, for every intent run so far:
//  - at most one of its attempts is in a block of the chain, with is_valid = true;
//  - a terminal status, once an object or the store shows it, stays; so does the closing mark;
//  - a final intent is final on one attempt, which is in a block, and stays on it;
//  - an abandoned intent: no attempt in a block, and no body replayed later lands;
//  - every body a signer is handed is in a record the store wrote first, and every byte string a
//    submitter gets is of an attempt whose delivery the store recorded first.
//
// A failing run names its seed and prints its trace; `INTENT_RACE_SEED=<seed>` runs that seed
// alone, with the same chain and the same choices (the order in which concurrent calls finish
// may still differ). `INTENT_RACE_SEEDS` runs more seeds, `INTENT_RACE_ROUNDS` more rounds in
// each.

const SEEDS = Number(process.env.INTENT_RACE_SEEDS ?? 2);
const ROUNDS = Number(process.env.INTENT_RACE_ROUNDS ?? 8);
const ONLY_SEED = process.env.INTENT_RACE_SEED;

/** The margin, which is also the pause of each double check, and the depth of final */
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
/** The slot every run starts at, so that a seed gives the same transactions */
const START_SLOT = 90_000_000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A refusal of the ledger, as a provider throws it */
const refusal = () =>
  Object.assign(new Error("refused"), { kind: "rejected", status: 400 });

/** A failure that says nothing about the outcome */
const lost = () => new Error("socket hang up");

const TERMINAL = new Set(["final", "abandoned"]);

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
  "build",
  "build",
  "build",
  "sign",
  "send",
  "send",
  "advance",
  "advance",
  "advance",
  "refresh",
] as const;
type Call = (typeof CALLS)[number] | "abandon";

/** A move of the chain, with every choice in it drawn when the move is planned */
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
  newAttempts: 0,
  intents: 0,
};

/** One intent of a run: its id, its two objects, and what the checks saw of it */
type Life = {
  readonly id: string;
  readonly X: TxIntent;
  Y?: TxIntent;
  /** Per source: the terminal status it showed first, and whether it showed the closing mark */
  readonly terminal: Map<string, string>;
  readonly closing: Set<string>;
  finalAttempt?: string;
  abandonedChecked?: true;
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

  // Every body the store ever held, and the intent of every attempt it recorded
  const inner = memoryIntentStore();
  const bodies = new Map<string, string>();
  const recorded = new Map<string, string>();
  const store: TxIntentStore = {
    load: (id) => inner.load(id),
    save: async (json: StoredTxIntentJSON, expectedRev) => {
      const written = await inner.save(json, expectedRev);
      if (!written) reached.refusedSaves += 1;
      if (written)
        for (const attempt of json.attempts) {
          recorded.set(attempt.txHash, json.id);
          // The body is a field of the library's encoding of the attempt
          const { built } = attempt as { built?: { tx?: string } };
          if (built?.tx) bodies.set(attempt.txHash, built.tx);
        }
      return written;
    },
  };

  const wallet = await walletOf();
  const address = (await wallet.getChangeAddress())!;
  for (const lovelace of [40, 30, 25, 20, 15, 12, 10, 8])
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
  const ySelects = ({ output }: UTxO) =>
    BigInt(
      output.amount.find((asset) => asset.unit === "lovelace")?.quantity ?? 0,
    ) < 32_000_000n;

  const held: string[] = [];
  const submitter = (kind: Kind, id: string) =>
    submitterOf(async (tx) => {
      // The record as it is when the bytes are handed over
      const now = inner.load(id);
      const txHash = await hashOf(tx);
      const attempt = (await now)?.attempts.find(
        (each) => each.txHash === txHash,
      );
      if (attempt === undefined || attempt.sends < 1)
        findings.push(
          `${short(txHash)} was submitted before its delivery was recorded`,
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

  /** The attempts of the intent in a block of the chain with is_valid = true */
  const landedOn = async (chain: TxEmulator, id: string) => {
    const landed: string[] = [];
    for (const [txHash, of] of recorded)
      if (of === id)
        try {
          const info = await chain.fetchTxInfo(txHash);
          if (info.validContract !== false) landed.push(txHash);
        } catch {
          // Not found
        }
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

  const bX = builderOf(providers[0]!, { store, intentDefaults: DEFAULTS });
  const bY = builderOf(providers[1]!, { store, intentDefaults: DEFAULTS });
  const lives: Life[] = [];
  const begin = () => {
    const id = `p${lives.length}`;
    const life: Life = {
      id,
      X: bX.intent(pay(), { id, payer: signer }),
      terminal: new Map(),
      closing: new Set(),
    };
    if (chance(0.5))
      life.Y = bY.intent(pay(), { id, payer: signer, canSelect: ySelects });
    lives.push(life);
    log(`a new intent ${id}${life.Y ? ", made by both" : ""}`);
    return life;
  };
  let life = begin();

  const foreignSpend = () =>
    idle(() => {
      const anchor = recordOf(life.X)
        .anchor.anchors.filter((entry) => entry.kind !== "parent")
        .at(-1);
      if (!anchor) return;
      const { input } = anchor.utxo;
      // Spent already
      if (
        !main
          .utxos({ txHash: input.txHash })
          .some((utxo) => utxo.input.outputIndex === input.outputIndex)
      )
        return;
      main.removeUtxos([input]);
      reached.foreignSpends += 1;
      log(`someone else spent the anchor ${short(anchor.utxo.input.txHash)}`);
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

  const call = async (owner: Life, who: TxIntent, name: Call, kind: Kind) => {
    const label = `${owner.id} ${who === owner.X ? "X" : "Y"}.${name}${name === "send" || name === "advance" ? `(${kind})` : ""}`;
    try {
      if (name === "build") await who.build();
      else if (name === "sign") await who.sign({ signers: signer });
      else if (name === "send")
        await who.send({
          submitter: submitter(kind, owner.id),
          signers: signer,
        });
      else if (name === "advance")
        await who.advance({
          submitter: submitter(kind, owner.id),
          signers: signer,
        });
      else if (name === "refresh") await who.refresh();
      else await who.abandon();
      log(`${label}: ${who.status} ${short(who.txHash ?? "")}`);
    } catch (error) {
      const code = (error as { code?: string }).code;
      log(
        `${label}: ${code ?? String(error).slice(0, 60)}, ${who.status} ${short(who.txHash ?? "")}`,
      );
    }
  };

  /** The checks of one intent after a round */
  const check = async (self: Life) => {
    const { id, X, Y, terminal, closing } = self;
    const landed = await landedOn(main, id);
    if (landed.length > 1)
      findings.push(`${id}: two attempts in blocks of one chain: ${landed}`);
    const stored = await inner.load(id);
    const sources: [string, string | undefined, boolean, string | undefined][] =
      [
        ["X", X.status, X.closing, X.landed?.txHash],
        ["Y", Y?.status, Y?.closing ?? false, Y?.landed?.txHash],
        [
          "the store",
          stored?.status,
          stored?.closing === true,
          stored?.attempts.find((attempt) => attempt.status === "final")
            ?.txHash,
        ],
      ];
    for (const [name, status, marked, landedHash] of sources) {
      const was = terminal.get(name);
      if (was !== undefined && status !== was)
        findings.push(`${id}: ${name} was ${was}, now ${status}`);
      if (was === undefined && status !== undefined && TERMINAL.has(status))
        terminal.set(name, status);
      if (closing.has(name) && !marked)
        findings.push(`${id}: ${name} took the closing mark back`);
      if (marked) closing.add(name);
      if (status === "final") {
        if (landedHash === undefined)
          findings.push(`${id}: ${name} is final on no attempt`);
        else {
          self.finalAttempt ??= landedHash;
          if (landedHash !== self.finalAttempt)
            findings.push(
              `${id}: ${name} is final on ${short(landedHash)}, earlier on ${short(self.finalAttempt)}`,
            );
          if (!landed.includes(landedHash))
            findings.push(
              `${id}: ${name} is final on ${short(landedHash)}, which is in no block`,
            );
        }
      }
    }
    if (stored?.status === "abandoned") {
      if (landed.length > 0)
        findings.push(`${id}: abandoned with ${short(landed[0]!)} in a block`);
      if (!self.abandonedChecked) {
        self.abandonedChecked = true;
        // No body replayed now or later may land
        for (const [txHash, of] of recorded)
          if (of === id) await replay(main, txHash);
        for (const tx of held) await main.submitTx(tx).catch(() => undefined);
        const after = await landedOn(main, id);
        if (after.length > 0)
          findings.push(`${id}: abandoned, then ${short(after[0]!)} landed`);
      }
    }
  };

  for (let round = 0; round < ROUNDS; round++) {
    const before = findings.length;
    if (!life.Y && round >= 1)
      life.Y = await bY
        .resume(life.id, { payer: signer, canSelect: ySelects })
        .catch(() => undefined);
    // A fork to roll back to within the round
    await forkPoint();
    // Calls at once, and moves of the chain at random moments among them; every third round
    // someone else spends the anchor, and every third round the chain rolls back
    const tasks: Promise<unknown>[] = [];
    const objects = life.Y ? [life.X, life.Y] : [life.X];
    const calls = 1 + random.int(3);
    for (let i = 0; i < calls; i++) {
      const who = pick(objects);
      const name: Call = chance(0.03) ? "abandon" : pick(CALLS);
      tasks.push(call(life, who, name, pick(KINDS)));
    }
    // Now and then a call on an intent that ended, which must stay as it ended
    const ended = lives.slice(0, -1);
    if (ended.length > 0 && chance(0.4)) {
      const owner = pick(ended);
      const name: Call = chance(0.1) ? "abandon" : pick(CALLS);
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
    const attempts = (await inner.load(life.id))?.attempts.length ?? 0;
    if (findings.length > before) findings.push(`in round ${round}`);
    log(
      `round ${round}: slot ${main.slot}, ${life.id} X ${life.X.status}, Y ${life.Y?.status}, stored ${(await inner.load(life.id))?.status} with ${attempts} attempts, landed [${(await landedOn(main, life.id)).map(short)}]`,
    );
    // A final or abandoned intent: the next rounds run a new one
    if (TERMINAL.has((await inner.load(life.id))?.status ?? "")) {
      reached.newAttempts += Math.max(0, attempts - 1);
      reached.intents += 1;
      life = begin();
    }
  }
  reached.newAttempts += Math.max(
    0,
    ((await inner.load(life.id))?.attempts.length ?? 0) - 1,
  );
  // Last, every body and every held byte string once more, on the chain as it is
  for (const txHash of bodies.keys()) await replay(main, txHash);
  for (const tx of held) await main.submitTx(tx).catch(() => undefined);
  for (const { id } of lives) {
    const landed = await landedOn(main, id);
    if (landed.length > 1)
      findings.push(`${id}: two attempts in blocks at the end: ${landed}`);
  }
  return { findings, trace };
};

describe("Two objects on one record, with a moving chain and a replayer", () => {
  const seeds =
    ONLY_SEED !== undefined
      ? [Number(ONLY_SEED)]
      : Array.from({ length: SEEDS }, (_, i) => i + 1);
  it.each(seeds)(
    "pays at most once, keeps final and abandoned, and hands out only recorded bodies: seed %i",
    async (seed) => {
      const { findings, trace } = await run(seed);
      if (findings.length > 0)
        throw new Error(
          `seed ${seed} (INTENT_RACE_SEED=${seed}): ${findings.join("; ")}\n${trace.join("\n")}`,
        );
    },
    ROUNDS * 20_000,
  );

  // The runs above are only worth something if they reach these moves
  (ONLY_SEED === undefined ? it : it.skip)(
    "reached two writers on one revision, new attempts, foreign spends of the anchor and rollbacks",
    () => {
      expect(reached.refusedSaves).toBeGreaterThan(0);
      expect(reached.rollbacks).toBeGreaterThan(0);
      expect(reached.foreignSpends).toBeGreaterThan(0);
      expect(reached.newAttempts).toBeGreaterThan(0);
      expect(reached.intents).toBeGreaterThan(0);
    },
  );
});
