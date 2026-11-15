import type { MeshWallet } from "@meshsdk/wallet";
import { deserializeAddress } from "@meshsdk/core";

import type { PlanSteps, TxBuilder, TxPlan } from "../../../src/tx-builder";
import type { Fault, StoreFault } from "./fault-util";
import { guard } from "../../../src/tx-builder";
import { ref } from "../utxo-util";
import { codeOf, DEAD, Process, runStep, sleep, World } from "./fault-util";
import { advance } from "./plan-emulator-util";
import { seeded } from "./plan-util";
import { ADA, alice, bob, carol, dave, payTo } from "./run-util";

// Journeys of plans with a store, each run once with one fault at one call: a store call that
// throws, loses its answer, answers false, or never returns; a provider or submitter call that
// never returns, before or after it went through; a call that pauses while another process goes
// on, and wakes. After the fault a fresh process (or, for a fault the process lives through, the
// same objects) carries every plan to its end. A plan that stops with a payment not made is made
// in its place with `replan`, under a new id, once it is stopped, and that plan is carried to its
// end.
//
// Checked around every step and at the end:
//  - an object never shows a revision ahead of the store, nor a body the store does not hold;
//    at the store's revision it shows the stored record;
//  - the store's record of an id never changes the bodies of its steps;
//  - a body reaches a signer only once the store holds it; bytes reach a submitter only once the
//    store recorded their delivery, as the stored signed bytes of the step, and a step reaches a
//    submitter for the first time only when every step before it is in a block;
//  - a terminal status (final, stopped), of the store or of an object, never changes; the stop
//    mark stays;
//  - every payment is made at most once, and every transaction that lands is a recorded step;
//  - a final plan has every step in a block; a stopped plan has every step final or dead, and
//    no step called dead lands, not even when its bytes are sent again at the end;
//  - a plan meant to pay ends with every payment made once (final, or stopped and made again);
//    one meant to end ends final or stopped.
//
// Each journey runs clean, then `PLAN_FAULT_CASES` of its faults (4 by default), chosen by
// `PLAN_FAULT_SEED` (1 by default); `PLAN_FAULT_CASES=all` runs every fault at every call.

const CASES_ENV = process.env.PLAN_FAULT_CASES;
const CASES = CASES_ENV === "all" ? Infinity : Number(CASES_ENV ?? 4);
const SEED = Number(process.env.PLAN_FAULT_SEED ?? 1);

type Ctx = {
  readonly world: World;
  readonly builder: TxBuilder;
  readonly plans: Record<string, TxPlan>;
};

type Step = {
  readonly name: string;
  /** The error the step ends with when no fault fired */
  readonly expect?: string;
  readonly run: (ctx: Ctx) => Promise<unknown>;
};

type Payment = { readonly address: string; readonly lovelace: bigint };

type Journey = {
  readonly ids: readonly string[];
  /**
   * "pay": every payment is made once, by the plan or by the plan made in its place;
   * "end": the plan ends final or stopped
   */
  readonly goal: Record<string, "pay" | "end">;
  /** Every payment of the journey's plans, each to its own address */
  readonly payments: readonly Payment[];
  readonly steps: readonly Step[];
  readonly signers: (world: World) => MeshWallet[];
  /** Makes the plan of an id, when no record of it was written */
  readonly make: (
    world: World,
    builder: TxBuilder,
    id: string,
    plans: Record<string, TxPlan>,
  ) => Promise<TxPlan>;
  /** The held bytes land at the crash */
  readonly flushAtCrash?: true;
  /** The payer is an address: a resumed plan is given none */
  readonly addressPayer?: true;
  /** A step that needs signatures gets them through addWitnesses */
  readonly witnesses?: true;
  /** The plan is stopped by whoever carries it on */
  readonly stop?: true;
};

const at = (ctx: Ctx, id: string) => ctx.plans[id]!;

/** The step that makes the plan of an id */
const make = (journey: () => Journey, id: string): Step => ({
  name: `${id}: builder.plan`,
  run: async (c) => {
    c.plans[id] = await journey().make(c.world, c.builder, id, c.plans);
  },
});

/** A step that runs a plan with the submitters holding the bytes back */
const sendHeld = (id: string): Step => ({
  name: `${id}.run(sent) held`,
  run: async (ctx) => {
    ctx.world.submitMode = "hold";
    return at(ctx, id).run({ waitFor: "sent" });
  },
});

/** The held bytes are lost, the submitters forward again, and time passes the plan's deadline */
const lose = (ctx: Ctx, id: string) => {
  ctx.world.held.length = 0;
  ctx.world.submitMode = "forward";
  ctx.world.emulator.advanceTo({ time: at(ctx, id).until! + 2_000 });
};

/** The id of the plan made in place of a stopped plan */
const againOf = (id: string) => `${id}-again`;

/**
 * A plan made in place of a stopped plan by `replan`, under a new id, and run to final; the
 * payer is the wallet, or the address of a journey whose payer is an address
 */
const again = (id: string, addressPayer = false): Step => ({
  name: `${againOf(id)}: replan, run(final)`,
  run: async (c) => {
    const stopped = at(c, id);
    if (stopped.status !== "stopped")
      throw new Error(`${id} is ${stopped.status}, not stopped`);
    const next = await stopped.replan({
      id: againOf(id),
      payer: addressPayer ? c.world.address : c.world.wallet,
    });
    c.plans[againOf(id)] = next;
    return next.run({ waitFor: "final" });
  },
});

const A: Payment = { address: alice, lovelace: 5n * ADA };
const B: Payment = { address: bob, lovelace: 3n * ADA };
const C: Payment = { address: carol, lovelace: 2n * ADA };
const D: Payment = { address: dave, lovelace: 4n * ADA };
const partOf = ({ address, lovelace }: Payment) => payTo(address, lovelace);

/** A plan of the payer's wallet */
const planOf =
  (steps: () => PlanSteps | ReturnType<typeof partOf>): Journey["make"] =>
  (world, builder, id) =>
    builder.plan(steps(), { id, payer: world.wallet });

const one = {
  ids: ["pay"],
  signers: (w: World) => [w.wallet],
  payments: [A],
  make: planOf(() => partOf(A)),
};
const three = {
  ids: ["pay"],
  signers: (w: World) => [w.wallet],
  payments: [A, B, C],
  make: planOf(() => ({ a: partOf(A), b: partOf(B), c: partOf(C) })),
};
const two = {
  ids: ["pay"],
  signers: (w: World) => [w.wallet],
  payments: [A, B],
  make: planOf(() => ({ a: partOf(A), b: partOf(B) })),
};

const pays: Journey = {
  ...one,
  goal: { pay: "pay" },
  steps: [
    make(() => pays, "pay"),
    { name: "sign", run: (c) => at(c, "pay").sign() },
    { name: "run(sent)", run: (c) => at(c, "pay").run({ waitFor: "sent" }) },
    {
      name: "run(final)",
      run: (c) => at(c, "pay").run({ waitFor: "final" }),
    },
  ],
};

const paysInSteps: Journey = {
  ...three,
  goal: { pay: "pay" },
  steps: [
    make(() => paysInSteps, "pay"),
    { name: "sign", run: (c) => at(c, "pay").sign() },
    { name: "run(sent) a", run: (c) => at(c, "pay").run({ waitFor: "sent" }) },
    { name: "run(sent) b", run: (c) => at(c, "pay").run({ waitFor: "sent" }) },
    {
      name: "run(final)",
      run: (c) => at(c, "pay").run({ waitFor: "final" }),
    },
  ],
};

/** Runs with a submitter that refuses, then forwards again */
const refusedRun = (id: string): Step => ({
  name: `${id}.run(sent) refused`,
  expect: "REJECTED",
  run: async (c) => {
    c.world.submitMode = "refuse";
    try {
      return await at(c, id).run({ waitFor: "sent" });
    } finally {
      c.world.submitMode = "forward";
    }
  },
});

const refused: Journey = {
  ...one,
  goal: { pay: "pay" },
  steps: [
    make(() => refused, "pay"),
    refusedRun("pay"),
    {
      name: "run(final) again",
      run: async (c) => {
        advance(c.world.emulator, 1);
        return at(c, "pay").run({ waitFor: "final" });
      },
    },
  ],
};

// The second step refused once the first is in a block: the refusal counts, and the same bytes
// go again
const refusedSecond: Journey = {
  ...two,
  goal: { pay: "pay" },
  steps: [
    make(() => refusedSecond, "pay"),
    { name: "run(sent) a", run: (c) => at(c, "pay").run({ waitFor: "sent" }) },
    refusedRun("pay"),
    {
      name: "run(final) again",
      run: async (c) => {
        advance(c.world.emulator, 1);
        return at(c, "pay").run({ waitFor: "final" });
      },
    },
  ],
};

const expires: Journey = {
  ...one,
  goal: { pay: "pay" },
  steps: [
    make(() => expires, "pay"),
    sendHeld("pay"),
    {
      name: "run(final) past the deadline",
      expect: "EXPIRED",
      run: async (c) => {
        lose(c, "pay");
        return at(c, "pay").run({ waitFor: "final" });
      },
    },
    again("pay"),
  ],
};

// Stopped while its first step may land: stopping, then stopped once nothing of it can land
const stops: Journey = {
  ...two,
  goal: { pay: "end" },
  stop: true,
  steps: [
    make(() => stops, "pay"),
    { name: "sign", run: (c) => at(c, "pay").sign() },
    sendHeld("pay"),
    { name: "stop() while a may land", run: (c) => at(c, "pay").stop() },
    {
      name: "run() after stop()",
      expect: "INVALID_STATE",
      run: (c) => at(c, "pay").run(),
    },
    {
      name: "refresh() past the deadline",
      run: async (c) => {
        advance(c.world.emulator, 700);
        return at(c, "pay").refresh();
      },
    },
  ],
};

const stopsBuilt: Journey = {
  ...one,
  goal: { pay: "end" },
  stop: true,
  steps: [
    make(() => stopsBuilt, "pay"),
    { name: "stop() a built plan", run: (c) => at(c, "pay").stop() },
    {
      name: "refresh() past the deadline",
      run: async (c) => {
        advance(c.world.emulator, 700);
        return at(c, "pay").refresh();
      },
    },
  ],
};

// An input of the step spent by someone else while the step is held: the step never lands, and
// the payment is made by the plan made in its place
const inputSpent: Journey = {
  ...one,
  goal: { pay: "pay" },
  steps: [
    make(() => inputSpent, "pay"),
    sendHeld("pay"),
    {
      name: "an input spent; run(final) past the deadline",
      expect: "EXPIRED",
      run: async (c) => {
        const input = at(c, "pay").step("main").inputs[0]!;
        c.world.emulator.removeUtxos([ref(input)]);
        lose(c, "pay");
        return at(c, "pay").run({ waitFor: "final" });
      },
    },
    again("pay"),
  ],
};

// Two plans: p of two steps, and c built after p, on the change of p's last step
const chainMake: Journey["make"] = (world, builder, id, plans) =>
  id === "p"
    ? builder.plan({ a: partOf(A), b: partOf(B) }, { id, payer: world.wallet })
    : builder.plan(partOf(D), { id, payer: world.wallet, after: plans.p! });

const chain: Journey = {
  ids: ["p", "c"],
  goal: { p: "pay", c: "pay" },
  payments: [A, B, D],
  signers: (w) => [w.wallet],
  make: chainMake,
  steps: [
    make(() => chain, "p"),
    { name: "p.run(sent) a", run: (c) => at(c, "p").run({ waitFor: "sent" }) },
    { name: "p.run(sent) b", run: (c) => at(c, "p").run({ waitFor: "sent" }) },
    make(() => chain, "c"),
    {
      name: "c.run(final)",
      run: (c) => at(c, "c").run({ waitFor: "final" }),
    },
    {
      name: "p.run(final)",
      run: (c) => at(c, "p").run({ waitFor: "final" }),
    },
  ],
};

// Held: the first step expires and the second is orphaned; both are paid by the plan in its place
const chainHeld: Journey = {
  ...two,
  goal: { pay: "pay" },
  steps: [
    make(() => chainHeld, "pay"),
    sendHeld("pay"),
    {
      name: "run(final) past the deadline",
      expect: "EXPIRED",
      run: async (c) => {
        lose(c, "pay");
        return at(c, "pay").run({ waitFor: "final" });
      },
    },
    again("pay"),
  ],
};

// Both held: p's first step expires and its second is orphaned; c, built after p on the change of
// p's last step, expires; both are paid by the plans in their place
const afterHeld: Journey = {
  ...chain,
  steps: [
    make(() => afterHeld, "p"),
    make(() => afterHeld, "c"),
    sendHeld("p"),
    sendHeld("c"),
    {
      name: "p.run(final) past the deadline",
      expect: "EXPIRED",
      run: async (c) => {
        lose(c, "p");
        return at(c, "p").run({ waitFor: "final" });
      },
    },
    {
      name: "c.run(final)",
      expect: "EXPIRED",
      run: (c) => at(c, "c").run({ waitFor: "final", timeoutMs: 3_000 }),
    },
    again("p"),
    again("c"),
  ],
};

/** The signatures a wallet gives for the steps that still need its key */
const witnessesOf = async (wallet: MeshWallet, plan: TxPlan) => {
  const key = deserializeAddress((await wallet.getChangeAddress())!).pubKeyHash;
  const sets: string[] = [];
  for (const step of plan.steps)
    if (step.missing.some((each) => each.keyHash === key))
      sets.push(await wallet.signTx(step.tx, true));
  return sets;
};

// The payer is an address; the first step needs the second key too
const multisig: Journey = {
  ids: ["ms"],
  goal: { ms: "pay" },
  payments: [A, B],
  signers: (w) => [w.wallet, w.other],
  addressPayer: true,
  make: (world, builder, id) =>
    builder.plan(
      {
        a: [partOf(A), guard.pubKey({ address: world.otherAddress })],
        b: partOf(B),
      },
      { id, payer: world.address },
    ),
  steps: [
    make(() => multisig, "ms"),
    {
      name: "addWitnesses(payer)",
      run: async (c) =>
        at(c, "ms").addWitnesses(
          ...(await witnessesOf(c.world.wallet, at(c, "ms"))),
        ),
    },
    {
      name: "addWitnesses(second key)",
      run: async (c) =>
        at(c, "ms").addWitnesses(
          ...(await witnessesOf(c.world.other, at(c, "ms"))),
        ),
    },
    {
      name: "run(final)",
      run: (c) => at(c, "ms").run({ waitFor: "final" }),
    },
  ],
};

const JOURNEYS: Record<string, Journey> = {
  pays,
  "pays in three steps": paysInSteps,
  refused,
  "refused at the second step": refusedSecond,
  expires,
  "expires, the held bytes landing at the crash": {
    ...expires,
    flushAtCrash: true,
  },
  stops,
  "stops, the held bytes landing at the crash": {
    ...stops,
    flushAtCrash: true,
  },
  stopsBuilt,
  inputSpent,
  chain,
  chainHeld,
  "chainHeld, the held bytes landing at the crash": {
    ...chainHeld,
    flushAtCrash: true,
  },
  "a plan built after a plan that does not land": afterHeld,
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

const TERMINAL = new Set(["final", "stopped"]);
const LATER = new Set([
  "EXPIRED",
  "ORPHANED",
  "SCRIPT_FAILED",
  "CONFIRM_TIMEOUT",
  "INVALID_STATE",
]);

/** The plan of an id: the recorded one, else a new one */
const planIn = async (
  world: World,
  journey: Journey,
  builder: TxBuilder,
  id: string,
  plans: Record<string, TxPlan>,
) => {
  try {
    return await builder.resume(
      id,
      journey.addressPayer ? {} : { payer: world.wallet },
    );
  } catch (error) {
    if (codeOf(error) !== "PLAN_NOT_FOUND") throw error;
    return journey.make(world, builder, id, plans);
  }
};

/** Runs one plan to final or stopped, as the journey means it */
const carryPlan = async (
  world: World,
  journey: Journey,
  id: string,
  plan: TxPlan,
  stop: boolean,
  errors: string[],
) => {
  const signers = journey.signers(world);
  for (let i = 0; i < 40 && !TERMINAL.has(plan.status); i++) {
    const status = plan.status;
    try {
      if (stop && plan.toJSON().stopped !== true) {
        await plan.stop();
        await world.checkObject(plan, id, `${id}.stop`);
        continue;
      }
      if (journey.witnesses && plan.steps.some((s) => s.status === "built")) {
        for (const wallet of signers) {
          const sets = await witnessesOf(wallet, plan);
          if (sets.length === 0) continue;
          await plan.addWitnesses(...sets);
          await world.checkObject(plan, id, `${id}.addWitnesses`);
        }
        await plan.run({ waitFor: "final", timeoutMs: 3_000 });
      } else await plan.run({ waitFor: "final", signers, timeoutMs: 3_000 });
      await world.checkObject(plan, id, `${id}.run`);
      if (!TERMINAL.has(plan.status)) advance(world.emulator, 700);
    } catch (error) {
      const code = codeOf(error);
      errors.push(`${id} ${status}: ${code}`);
      await world.checkObject(plan, id, `${id} after ${code}`);
      if (code === "REJECTED") advance(world.emulator, 1);
      else if (LATER.has(code)) {
        advance(world.emulator, 700);
        await plan
          .refresh()
          .then(() => world.checkObject(plan, id, `${id}.refresh`))
          .catch((again) => errors.push(`${id}.refresh: ${codeOf(again)}`));
      } else await sleep(5);
    }
  }
};

/** Carries every plan of the journey to its end, in a fault-free process or on `same` */
const carryOn = async (
  world: World,
  journey: Journey,
  errors: string[],
  same?: { builder: TxBuilder; plans: Record<string, TxPlan> },
) => {
  const builder = same?.builder ?? world.builder(new Process());
  const plans: Record<string, TxPlan> = same?.plans ?? {};
  for (const id of journey.ids) {
    plans[id] ??= await planIn(world, journey, builder, id, plans);
    const plan = plans[id]!;
    if (!same)
      await plan
        .refresh()
        .catch((error) => errors.push(`${id}.refresh: ${codeOf(error)}`));
    await carryPlan(world, journey, id, plan, journey.stop === true, errors);
    // A payment not made is made again, by a plan of its own, once nothing of this one can land
    if (journey.goal[id] !== "pay" || plan.status !== "stopped") continue;
    const again = againOf(id);
    try {
      plans[again] ??= await builder.resume(
        again,
        journey.addressPayer ? {} : { payer: world.wallet },
      );
    } catch (error) {
      if (codeOf(error) !== "PLAN_NOT_FOUND") throw error;
      plans[again] = await plan.replan({
        id: again,
        payer: journey.addressPayer ? world.address : world.wallet,
      });
    }
    await carryPlan(world, journey, again, plans[again]!, false, errors);
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
  const known = world.recordedHashes();
  for (const txHash of landed)
    if (!known.has(txHash))
      world.violation(`${txHash.slice(0, 8)} landed, and no record holds it`);
  for (const id of world.history.keys()) {
    const json = await world.inner.load(id);
    if (json === undefined) continue;
    for (const step of json.steps) {
      const on = await world.onChain(step.txHash);
      if (json.status === "final" && !on)
        world.violation(`${id}: final, and ${step.name} is in no block`);
      if (DEAD.has(step.status) && on)
        world.violation(`${id}: ${step.name} is ${step.status}, and landed`);
      if (
        json.status === "stopped" &&
        step.status !== "final" &&
        !DEAD.has(step.status)
      )
        world.violation(`${id}: stopped, and ${step.name} is ${step.status}`);
    }
  }
  for (const id of journey.ids) {
    const json = await world.inner.load(id);
    const status = json?.status ?? "no record";
    const again = (await world.inner.load(againOf(id)))?.status;
    const goal = journey.goal[id];
    if (goal === "end" && !TERMINAL.has(status))
      world.violation(`${id}: ended ${status}, neither final nor stopped`);
    if (
      goal === "pay" &&
      status !== "final" &&
      !(status === "stopped" && again === "final")
    )
      world.violation(
        `${id}: ended ${status}${again ? `, made again ${again}` : ""}, not paid`,
      );
  }
  // Every byte string of a step called dead, sent once more: none lands
  for (const id of world.history.keys()) {
    const json = await world.inner.load(id);
    for (const step of json?.steps ?? [])
      if (DEAD.has(step.status))
        for (const tx of world.delivered.get(step.txHash) ?? [])
          await world.emulator.submitTx(tx).catch(() => undefined);
  }
  for (const id of world.history.keys())
    for (const step of (await world.inner.load(id))?.steps ?? [])
      if (DEAD.has(step.status) && (await world.onChain(step.txHash)))
        world.violation(
          `${id}: ${step.name} is ${step.status}, and its bytes landed when sent again`,
        );
  const paid = journey.goal;
  const meant = Object.values(paid).every((goal) => goal === "pay");
  for (const { address, lovelace } of journey.payments) {
    const times = world.emulator
      .utxos({ address })
      .filter(
        (utxo) =>
          utxo.output.amount.find((a) => a.unit === "lovelace")?.quantity ===
          String(lovelace),
      ).length;
    if (times > 1) world.violation(`${address.slice(-8)} paid ${times} times`);
    if (meant && times !== 1)
      world.violation(`${address.slice(-8)} paid ${times} times, not once`);
  }
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
  const world = await World.create();
  const proc = new Process(kase.fault);
  const builder = world.builder(proc);
  const plans: Record<string, TxPlan> = {};
  const ctx: Ctx = { world, builder, plans };
  const errors: string[] = [];
  const checkAll = async (where: string) => {
    for (const id of new Set([...journey.ids, ...Object.keys(plans)]))
      await world.checkObject(plans[id], id, where);
  };
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
      await checkAll(`after ${step.name}`);
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
      await checkAll("after the wake");
    };
    try {
      if (kase.wake === "mid") {
        const other = world.builder(new Process());
        const id = journey.ids[0]!;
        await other
          .resume(id, journey.addressPayer ? {} : { payer: world.wallet })
          .then((plan) =>
            plan.run({
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
    await carryOn(
      world,
      journey,
      errors,
      same ? { builder, plans } : undefined,
    ).catch((error) => errors.push(`the run went on with ${codeOf(error)}`));
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
