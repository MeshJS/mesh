import type { MeshWallet } from "@meshsdk/wallet";

import type { TxBuilder, TxPlan } from "../../../src/tx-builder";
import type { Fault, StoreFault } from "./fault-util";
import { guard } from "../../../src/tx-builder";
import { recordOf } from "../../../src/tx-builder/plan/plan";
import { ref } from "../utxo-util";
import { codeOf, Process, runStep, sleep, World } from "./fault-util";
import { advance, pay } from "./plan-emulator-util";
import { seeded } from "./plan-util";

// Journeys of plans with a store, each run once with one fault at one call: a store call that
// throws, loses its answer, answers false, or never returns; a provider or submitter call that
// never returns, before or after it went through; a call that pauses while another process goes
// on, and wakes. After the fault a fresh process (or, for a fault the process lives through, the
// same objects) carries every plan to its end.
//
// Checked around every step and at the end:
//  - an object never shows a revision ahead of the store, nor a body the store does not hold;
//  - a body reaches a signer only once the store holds it; bytes reach a submitter only once the
//    store recorded their delivery, on the current attempt, as the stored bytes;
//  - a terminal status, of the store or of an object, never changes; the closing mark stays;
//  - at most one attempt of a plan lands; final is on the one that landed, abandoned has none;
//  - a plan meant to be paid ends final, one meant to be abandoned ends abandoned (or final,
//    with the one attempt that landed).
//
// Each journey runs clean, then `PLAN_FAULT_CASES` of its faults (4 by default), chosen by
// `PLAN_FAULT_SEED` (1 by default); `PLAN_FAULT_CASES=all` runs every fault at every call.

const CASES_ENV = process.env.PLAN_FAULT_CASES;
const CASES = CASES_ENV === "all" ? Infinity : Number(CASES_ENV ?? 4);
const SEED = Number(process.env.PLAN_FAULT_SEED ?? 1);

type Ctx = {
  readonly world: World;
  readonly plans: Record<string, TxPlan>;
};

type Step = {
  readonly name: string;
  /** The error the step ends with when no fault fired */
  readonly expect?: string;
  readonly run: (ctx: Ctx) => Promise<unknown>;
};

type Journey = {
  readonly ids: readonly string[];
  /** "pay": ends final; "abandon": ends abandoned, unless an attempt landed (then final) */
  readonly goal: Record<string, "pay" | "abandon">;
  readonly steps: readonly Step[];
  readonly signers: (world: World) => MeshWallet[];
  /** Makes the plan of an id, when no record of it was written */
  readonly make: (
    world: World,
    builder: TxBuilder,
    id: string,
    plans: Record<string, TxPlan>,
  ) => TxPlan;
  /** The held bytes land at the crash */
  readonly flushAtCrash?: true;
  /** The payer is an address: a resumed plan is given none */
  readonly addressPayer?: true;
  /** A built attempt gets the rest of its signatures through addWitnesses */
  readonly witnesses?: true;
};

const at = (ctx: Ctx, id: string) => ctx.plans[id]!;
const untilOf = (plan: TxPlan) => plan.attempts.at(-1)!.until;

/** build(), and a check that the store holds the body it hands out */
const checkedBuild = async (ctx: Ctx, id: string) => {
  const built = await at(ctx, id).build();
  await ctx.world.checkBody(id, built.txHash, `build(${id})`);
  return built;
};

/** A step that sends with the submitters holding the bytes back */
const sendHeld = (id: string): Step => ({
  name: `${id}.send held`,
  run: async (ctx) => {
    ctx.world.submitMode = "hold";
    return at(ctx, id).send();
  },
});

/** The held bytes are lost, the submitters forward again, and time passes the deadline */
const lose = (ctx: Ctx, id: string) => {
  ctx.world.held.length = 0;
  ctx.world.submitMode = "forward";
  ctx.world.emulator.advanceTo({ time: untilOf(at(ctx, id)) });
};

const payment: Journey["make"] = (world, builder, id) =>
  builder.plan(pay(), { id, payer: world.wallet });
const one = { ids: ["pay"], signers: (w: World) => [w.wallet], make: payment };

const pays: Journey = {
  ...one,
  goal: { pay: "pay" },
  steps: [
    { name: "build", run: (c) => checkedBuild(c, "pay") },
    { name: "sign", run: (c) => at(c, "pay").sign() },
    { name: "send(sent)", run: (c) => at(c, "pay").send() },
    {
      name: "send(final)",
      run: (c) => at(c, "pay").send({ waitFor: "final" }),
    },
  ],
};

const refused: Journey = {
  ...one,
  goal: { pay: "pay" },
  steps: [
    {
      name: "send refused",
      expect: "REJECTED",
      run: async (c) => {
        c.world.submitMode = "refuse";
        try {
          return await at(c, "pay").send();
        } finally {
          c.world.submitMode = "forward";
        }
      },
    },
    {
      name: "build again",
      run: async (c) => {
        advance(c.world.emulator, 1);
        return checkedBuild(c, "pay");
      },
    },
    {
      name: "send(final)",
      run: (c) => at(c, "pay").send({ waitFor: "final" }),
    },
  ],
};

const expires: Journey = {
  ...one,
  goal: { pay: "pay" },
  steps: [
    sendHeld("pay"),
    {
      name: "advance() past the deadline",
      run: async (c) => {
        lose(c, "pay");
        return at(c, "pay").advance({ waitFor: "final" });
      },
    },
  ],
};

const abandons: Journey = {
  ...one,
  goal: { pay: "abandon" },
  steps: [
    sendHeld("pay"),
    {
      name: "abandon() while live",
      expect: "STILL_LIVE",
      run: (c) => at(c, "pay").abandon(),
    },
    {
      name: "advance() once safe",
      run: async (c) => {
        advance(c.world.emulator, 700);
        return at(c, "pay").advance();
      },
    },
  ],
};

// The payer's anchor spent by someone else while the attempt is held: past its deadline the
// plan changes its anchor after the double check
const movesAnchor: Journey = {
  ...one,
  goal: { pay: "pay" },
  steps: [
    sendHeld("pay"),
    {
      name: "the anchor spent; advance() past the deadline",
      run: async (c) => {
        const anchor = recordOf(at(c, "pay")).anchor.anchors[0]!.utxo;
        c.world.emulator.removeUtxos([ref(anchor)]);
        lose(c, "pay");
        return at(c, "pay").advance({ waitFor: "final" });
      },
    },
  ],
};

const abandonsDraft: Journey = {
  ...one,
  goal: { pay: "abandon" },
  steps: [{ name: "abandon() a draft", run: (c) => at(c, "pay").abandon() }],
};

const chain: Journey = {
  ids: ["p", "c"],
  goal: { p: "pay", c: "pay" },
  signers: (w) => [w.wallet],
  make: (world, builder, id, plans) =>
    id === "p"
      ? builder.plan(pay(), { id, payer: world.wallet })
      : builder.plan(pay(3_000_000n), {
          id,
          payer: world.wallet,
          after: plans.p!,
        }),
  steps: [
    { name: "p.send(sent)", run: (c) => at(c, "p").send() },
    { name: "c.build", run: (c) => checkedBuild(c, "c") },
    {
      name: "c.send(final)",
      run: (c) => at(c, "c").send({ waitFor: "final" }),
    },
    {
      name: "p.send(final)",
      run: (c) => at(c, "p").send({ waitFor: "final" }),
    },
  ],
};

// Both held: the parent's attempt expires and is replaced, the child is orphaned and built again
const chainHeld: Journey = {
  ...chain,
  steps: [
    sendHeld("p"),
    { name: "c.send held", run: (c) => at(c, "c").send() },
    {
      name: "p.advance(final) past the deadline",
      run: async (c) => {
        lose(c, "p");
        return at(c, "p").advance({ waitFor: "final" });
      },
    },
    {
      name: "c.advance(final)",
      run: (c) => at(c, "c").advance({ waitFor: "final" }),
    },
  ],
};

const multisig: Journey = {
  ids: ["ms"],
  goal: { ms: "pay" },
  signers: (w) => [w.wallet, w.other],
  addressPayer: true,
  make: (world, builder, id) =>
    builder.plan([pay(), guard.pubKey({ address: world.otherAddress })], {
      id,
      payer: world.address,
    }),
  steps: [
    { name: "build", run: (c) => checkedBuild(c, "ms") },
    {
      name: "addWitnesses(payer)",
      run: async (c) =>
        at(c, "ms").addWitnesses(
          await c.world.wallet.signTx(at(c, "ms").built!.tx, true),
        ),
    },
    {
      name: "addWitnesses(guard)",
      run: async (c) =>
        at(c, "ms").addWitnesses(
          await c.world.other.signTx(at(c, "ms").built!.tx, true),
        ),
    },
    {
      name: "send(final)",
      run: (c) => at(c, "ms").send({ waitFor: "final" }),
    },
  ],
};

const JOURNEYS: Record<string, Journey> = {
  pays,
  refused,
  expires,
  "expires, the held bytes landing at the crash": {
    ...expires,
    flushAtCrash: true,
  },
  abandons,
  "abandons, the held bytes landing at the crash": {
    ...abandons,
    flushAtCrash: true,
  },
  abandonsDraft,
  movesAnchor,
  chain,
  chainHeld,
  "chainHeld, the held bytes landing at the crash": {
    ...chainHeld,
    flushAtCrash: true,
  },
  multisig,
  "multisig, signatures added after the crash": {
    ...multisig,
    witnesses: true,
  },
};

/** One run: the fault, and how the run goes on after it */
type Case = {
  readonly fault?: Fault;
  /** A paused process wakes after the others are done, or after another one's first call */
  readonly wake?: "end" | "mid";
  /** The process lives on after its fault, and its objects go on */
  readonly same?: true;
};

const labelOf = ({ fault, wake, same }: Case) =>
  fault === undefined
    ? "clean"
    : `${fault.where} call ${fault.k}: ${
        fault.where === "store"
          ? fault.kind
          : fault.park
            ? "paused"
            : fault.after
              ? "through, then hangs"
              : "hangs"
      }${wake ? `, woken at the ${wake}` : ""}${same ? ", the same objects go on" : ""}`;

type Result = {
  readonly violations: readonly string[];
  readonly storeCalls: number;
  readonly ioCalls: number;
  readonly log: readonly string[];
  readonly errors: readonly string[];
};

const TERMINAL = new Set(["final", "abandoned"]);
const LATER = new Set(["STILL_LIVE", "EXPIRED", "CONFIRM_TIMEOUT", "ORPHANED"]);

/** Carries every plan of the journey to its end, in a fault-free process or on `same` */
const carryOn = async (
  world: World,
  journey: Journey,
  errors: string[],
  same?: Record<string, TxPlan>,
) => {
  const builder = world.builder(new Process(), journey.ids);
  const plans: Record<string, TxPlan> = same ?? {};
  if (!same)
    for (const id of journey.ids)
      try {
        plans[id] = await builder.resume(
          id,
          journey.addressPayer ? {} : { payer: world.wallet },
        );
      } catch (error) {
        if (codeOf(error) !== "PLAN_NOT_FOUND") throw error;
        plans[id] = journey.make(world, builder, id, plans);
      }
  const signers = journey.signers(world);
  for (const id of journey.ids) {
    const plan = plans[id]!;
    if (!same)
      await plan
        .refresh()
        .catch((error) => errors.push(`${id}.refresh: ${codeOf(error)}`));
    for (let i = 0; i < 40 && !TERMINAL.has(plan.status); i++) {
      const status = plan.status;
      try {
        if (
          journey.goal[id] === "abandon" &&
          !plan.closing &&
          plan.landed === undefined
        ) {
          await plan.abandon().catch((error) => {
            const code = codeOf(error);
            if (code === "STILL_LIVE") advance(world.emulator, 700);
            else if (code !== "ATTEMPT_ON_CHAIN") throw error;
          });
          await world.checkObject(plan, id, `${id}.abandon`);
          continue;
        }
        if (journey.witnesses && status === "built") {
          for (const wallet of signers) {
            if (plan.status !== "built") break;
            await plan.addWitnesses(await wallet.signTx(plan.built!.tx, true));
            await world.checkObject(plan, id, `${id}.addWitnesses`);
          }
          await plan.advance({ waitFor: "final", timeoutMs: 3_000 });
        } else
          await plan.advance({ waitFor: "final", signers, timeoutMs: 3_000 });
        await world.checkObject(plan, id, `${id}.advance`);
        if (!TERMINAL.has(plan.status)) advance(world.emulator, 700);
      } catch (error) {
        const code = codeOf(error);
        errors.push(`${id} ${status}: ${code}`);
        await world.checkObject(plan, id, `${id} after ${code}`);
        if (code === "REJECTED") {
          advance(world.emulator, 1);
          await plan.build().then(
            (built) => world.checkBody(id, built.txHash, `${id}.build`),
            (again) => errors.push(`${id}.build: ${codeOf(again)}`),
          );
        } else if (LATER.has(code)) advance(world.emulator, 700);
        else await sleep(5);
      }
    }
  }
};

/** The checks at the end of a run */
const finish = async (
  world: World,
  journey: Journey,
  proc: Process,
  errors: string[],
): Promise<Result> => {
  const landed = await world.landed();
  const known = new Set<string>();
  for (const id of journey.ids) {
    const json = await world.inner.load(id);
    const status = json?.status ?? "no record";
    const hashes = json?.attempts.map((a) => a.txHash) ?? [];
    for (const txHash of hashes) known.add(txHash);
    const mine = landed.filter((txHash) => hashes.includes(txHash));
    if (mine.length > 1)
      world.violation(`${id}: ${mine.length} attempts landed`);
    if (status === "abandoned" && mine.length > 0)
      world.violation(`${id}: abandoned, and ${mine[0]!.slice(0, 8)} landed`);
    if (status === "final" && mine.length !== 1)
      world.violation(`${id}: final with ${mine.length} attempts landed`);
    const final = json?.attempts.find((a) => a.status === "final");
    if (status === "final" && final?.txHash !== mine[0])
      world.violation(
        `${id}: final on ${final?.txHash.slice(0, 8)}, while ${mine[0]?.slice(0, 8)} landed`,
      );
    const goal = journey.goal[id];
    if (goal === "pay" && status !== "final")
      world.violation(`${id}: ended ${status}, not final`);
    if (
      goal === "abandon" &&
      status !== "abandoned" &&
      !(status === "final" && mine.length === 1)
    )
      world.violation(`${id}: ended ${status}, not abandoned`);
  }
  for (const txHash of landed)
    if (!known.has(txHash))
      world.violation(`${txHash.slice(0, 8)} landed, and no record holds it`);
  return {
    violations: world.violations,
    storeCalls: proc.storeCalls,
    ioCalls: proc.ioCalls,
    log: proc.log,
    errors,
  };
};

/** Runs a journey with the fault of `kase`, carries it on after the fault, and checks the end */
const runJourney = async (journey: Journey, kase: Case): Promise<Result> => {
  const world = await World.create(journey.ids);
  const proc = new Process(kase.fault);
  const builder = world.builder(proc, journey.ids);
  const plans: Record<string, TxPlan> = {};
  for (const id of journey.ids)
    plans[id] = journey.make(world, builder, id, plans);
  const ctx: Ctx = { world, plans };
  const errors: string[] = [];
  let paused: Promise<{ value?: unknown; error?: unknown }> | undefined;
  for (const step of journey.steps) {
    const end = await runStep(proc, () => step.run(ctx));
    if (end.hung) {
      if (proc.parked) paused = end.pending;
    } else {
      if ("error" in end) {
        const code = codeOf(end.error);
        errors.push(`${step.name}: ${code}`);
        if (!proc.fired && code !== step.expect)
          world.violation(
            `the step ${step.name} failed with no fault: ${code}`,
          );
      } else if (step.expect && !proc.fired)
        world.violation(`the step ${step.name} passed, not ${step.expect}`);
      for (const id of journey.ids)
        await world.checkObject(plans[id]!, id, `after ${step.name}`);
    }
    if (proc.fired || end.hung) break;
  }
  if (journey.flushAtCrash) await world.flush();
  world.submitMode = "forward";

  if (paused !== undefined) {
    // Another process goes on, and the paused one wakes and ends its step
    const wake = async () => {
      proc.wake();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const end = await Promise.race([
        paused!,
        new Promise<{ error: unknown }>((resolve) => {
          timer = setTimeout(
            () => resolve({ error: new Error("it did not settle") }),
            15_000,
          );
        }),
      ]);
      clearTimeout(timer);
      if ("error" in end) errors.push(`the woken step: ${codeOf(end.error)}`);
      for (const id of journey.ids)
        await world.checkObject(plans[id]!, id, "after the wake");
    };
    try {
      if (kase.wake === "mid") {
        const other = world.builder(new Process(), journey.ids);
        const id = journey.ids[0]!;
        await other
          .resume(id, journey.addressPayer ? {} : { payer: world.wallet })
          .then((plan) =>
            plan.advance({
              waitFor: "sent",
              signers: journey.signers(world),
              timeoutMs: 2_000,
            }),
          )
          .catch((error) => errors.push(`the other process: ${codeOf(error)}`));
        await wake();
        await carryOn(world, journey, errors);
      } else {
        await carryOn(world, journey, errors);
        await wake();
      }
    } catch (error) {
      errors.push(`the run went on with ${codeOf(error)}`);
    }
    // The woken process may have moved the record: one more process carries it to its end
    proc.crashed = true;
    await carryOn(world, journey, errors).catch((error) =>
      errors.push(`the last process: ${codeOf(error)}`),
    );
    return finish(world, journey, proc, errors);
  }

  const same = kase.same && !proc.crashed;
  // Unless it lives on, the process dies: its objects are dropped
  if (!same) proc.crashed = true;
  if (kase.fault !== undefined)
    await carryOn(world, journey, errors, same ? plans : undefined).catch(
      (error) => errors.push(`the run went on with ${codeOf(error)}`),
    );
  return finish(world, journey, proc, errors);
};

const STORE_FAULTS: readonly StoreFault[] = [
  "throwBefore",
  "lostAck",
  "false",
  "hangBefore",
  "hangAfter",
];

/** Every fault at every call the clean run made */
const casesOf = ({ storeCalls, ioCalls }: Result): Case[] => {
  const calls = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  const cases: Case[] = [];
  for (const kind of STORE_FAULTS)
    for (const k of calls(storeCalls))
      cases.push({ fault: { where: "store", k, kind } });
  for (const k of calls(ioCalls))
    cases.push(
      { fault: { where: "io", k } },
      { fault: { where: "io", k, after: true } },
    );
  for (const wake of ["end", "mid"] as const) {
    for (const k of calls(storeCalls))
      cases.push({ fault: { where: "store", k, kind: "park" }, wake });
    for (const k of calls(ioCalls))
      cases.push({ fault: { where: "io", k, park: true }, wake });
  }
  for (const kind of ["throwBefore", "lostAck", "false"] as const)
    for (const k of calls(storeCalls))
      cases.push({ fault: { where: "store", k, kind }, same: true });
  return cases;
};

/** `count` of the cases, chosen by the seed */
const sample = (cases: Case[], count: number, seed: number) => {
  if (count >= cases.length) return cases;
  const random = seeded(seed);
  // The first numbers of nearby seeds are alike
  for (let i = 0; i < 8; i++) random.next();
  const left = [...cases];
  return Array.from(
    { length: count },
    () => left.splice(random.int(left.length), 1)[0]!,
  );
};

describe("Plans with a store under a fault at one call", () => {
  const names = Object.keys(JOURNEYS);
  it.each(names)(
    "%s: pays at most once, records each action first, and ends as meant",
    async (name) => {
      const journey = JOURNEYS[name]!;
      const clean = await runJourney(journey, {});
      expect(clean.violations).toEqual([]);
      const cases = sample(
        casesOf(clean),
        CASES,
        SEED * 1_000 + names.indexOf(name),
      );
      const failures: string[] = [];
      for (const kase of cases) {
        const { violations, log, errors } = await runJourney(journey, kase);
        if (violations.length > 0)
          failures.push(
            `${labelOf(kase)}: ${violations.join("; ")}\n  calls: ${log.join(" | ")}\n  errors: ${errors.join(" | ")}`,
          );
      }
      if (failures.length > 0)
        throw new Error(
          `${name} (PLAN_FAULT_SEED=${SEED}, PLAN_FAULT_CASES=${CASES_ENV ?? 4}):\n${failures.join("\n")}`,
        );
    },
    CASES === Infinity ? 3_600_000 : 120_000,
  );

  it("catches a store that answers true to a save it did not write", async () => {
    const clean = await runJourney(pays, {});
    let saves = 0;
    for (let k = 1; k <= clean.storeCalls; k++) {
      const run = await runJourney(pays, {
        fault: { where: "store", k, kind: "liar" },
      });
      if (!run.log.some((line) => / save .*-> liar$/.test(line))) continue;
      saves += 1;
      expect(run.violations).not.toEqual([]);
    }
    expect(saves).toBeGreaterThan(0);
  });
});
