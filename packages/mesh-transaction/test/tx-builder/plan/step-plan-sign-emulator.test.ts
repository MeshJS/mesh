import { Crypto } from "@meshsdk/core-cst";

import type { TxPlanError } from "../../../src/tx-builder";
import type { StepPlan } from "../../../src/tx-builder/plan/step-plan";
import { guard } from "../../../src/tx-builder";
import { stepRecordOf } from "../../../src/tx-builder/plan/step-plan";
import { hashSigner, keysSigner, testKey } from "../hash-signer-util";
import { caught } from "./plan-emulator-util";
import {
  ADA,
  alice,
  bob,
  carol,
  paidTo,
  payTo,
  planOf,
  stepSetup,
  VALIDATORS,
  witnessSetOf,
} from "./step-plan-util";

// Signing a plan of steps: the payer by default, the signers a call names, a co-signer's
// witnesses through addWitnesses, what each step still misses, and the rule that a witness counts
// for the key of its own public key. Nothing is sent while a key is missing.

const statuses = (plan: StepPlan) =>
  Object.fromEntries(plan.steps.map((step) => [step.name, step.status]));

const missingKeys = (plan: StepPlan) =>
  Object.fromEntries(
    plan.steps.map((step) => [step.name, step.missing.map((k) => k.keyHash)]),
  );

describe.each(VALIDATORS)("signing a plan of steps (%s)", (v) => {
  beforeAll(() => Crypto.ready());

  it("signs every step with the payer when the call names no signer, before anything is sent", async () => {
    const { emulator, provider, builder, wallet } = await stepSetup(v);
    const plan = await planOf(
      builder,
      {
        a: payTo(alice, 5n * ADA),
        b: payTo(bob, 3n * ADA),
        c: payTo(carol, 2n * ADA),
      },
      { payer: wallet },
    );
    expect(plan.steps.every((step) => step.missing.length === 1)).toBe(true);
    expect(plan.steps.every((step) => step.signedTx === undefined)).toBe(true);
    await plan.sign();
    expect(statuses(plan)).toEqual({ a: "signed", b: "signed", c: "signed" });
    expect(missingKeys(plan)).toEqual({ a: [], b: [], c: [] });
    expect(plan.steps.every((step) => step.signedTx !== undefined)).toBe(true);
    expect(provider.control.count("submitTx")).toBe(0);
    await plan.run();
    expect(plan.status).toBe("final");
    expect(paidTo(emulator, carol)).toEqual([2n * ADA]);
  });

  it("signs with the signers a call names, and is MISSING_SIGNATURES with nothing sent when nobody can sign", async () => {
    const { emulator, provider, builder, wallet, address } = await stepSetup(v);
    // The payer is an address: it pays and signs nothing
    const plan = await planOf(
      builder,
      { a: payTo(alice, 5n * ADA), b: payTo(bob, 3n * ADA) },
      { payer: address },
    );
    const unsigned = (await caught(
      plan.sign(),
    )) as TxPlanError<"MISSING_SIGNATURES">;
    expect(unsigned.code).toBe("MISSING_SIGNATURES");
    expect(unsigned.step).toBe("a");
    expect(unsigned.details.missing).toEqual(plan.step("a").missing);
    const unsent = await caught(plan.run());
    expect([unsent.code, unsent.step]).toEqual(["MISSING_SIGNATURES", "a"]);
    expect(provider.control.count("submitTx")).toBe(0);

    await plan.sign({ signers: wallet });
    expect(statuses(plan)).toEqual({ a: "signed", b: "signed" });
    await plan.run();
    expect(plan.status).toBe("final");
    expect(paidTo(emulator, bob)).toEqual([3n * ADA]);
  });

  it("takes a co-signer's witnesses through addWitnesses, each on the step whose body it verifies against; missing per step; nothing sent before", async () => {
    const co = testKey();
    const { emulator, provider, builder, wallet } = await stepSetup(v);
    const plan = await planOf(
      builder,
      {
        a: [payTo(alice, 5n * ADA), guard.pubKey({ keyHash: co.keyHash })],
        b: payTo(bob, 3n * ADA),
        c: [payTo(carol, 2n * ADA), guard.pubKey({ keyHash: co.keyHash })],
      },
      { payer: wallet },
    );
    await plan.sign();
    expect(statuses(plan)).toEqual({ a: "built", b: "signed", c: "built" });
    expect(missingKeys(plan)).toEqual({
      a: [co.keyHash],
      b: [],
      c: [co.keyHash],
    });
    expect(plan.step("a").missing[0]!.roles).toEqual(["guard"]);
    expect(plan.step("a").signedTx).toBeUndefined();

    for (const waitFor of ["sent", "included"] as const) {
      const error = await caught(plan.run({ waitFor }));
      expect([error.code, error.step]).toEqual(["MISSING_SIGNATURES", "a"]);
    }
    expect(provider.control.count("submitTx")).toBe(0);

    // The witnesses in another order than the steps: each finds its own body
    await plan.addWitnesses(
      witnessSetOf(co.answer(plan.step("c").txHash)),
      witnessSetOf(co.answer(plan.step("a").txHash)),
    );
    expect(statuses(plan)).toEqual({ a: "signed", b: "signed", c: "signed" });
    await plan.run();
    expect(plan.status).toBe("final");
    expect(paidTo(emulator, carol)).toEqual([2n * ADA]);
  });

  it("counts a witness for the key of its own public key, never for the key it was asked for", async () => {
    const co = testKey();
    const other = testKey();
    const { provider, builder, wallet } = await stepSetup(v);
    const plan = await planOf(
      builder,
      [payTo(alice, 5n * ADA), guard.pubKey({ keyHash: co.keyHash })],
      { payer: wallet, extraKeyWitnesses: 1 },
    );
    // Asked for the co-signer's key, it answers with another key's signature of the body
    const impostor = hashSigner("object", ({ txHash }) => [
      other.answer(txHash),
    ]);
    await plan.sign({ signers: [wallet, impostor.signer] });
    expect(impostor.requests.map((r) => r.keys!.map((k) => k.keyHash))).toEqual(
      [[co.keyHash]],
    );
    expect(statuses(plan)).toEqual({ main: "built" });
    expect(missingKeys(plan)).toEqual({ main: [co.keyHash] });
    // Kept, as the one witness of another key the fee counts: for the other key
    expect(
      stepRecordOf(plan).steps[0]!.witnesses.map((w) => w.keyHash),
    ).toContain(other.keyHash);
    // The same through addWitnesses: kept for the other key, the one the fee counts beside
    await plan.addWitnesses(
      witnessSetOf(other.answer(plan.step("main").txHash)),
    );
    expect(missingKeys(plan)).toEqual({ main: [co.keyHash] });
    expect((await caught(plan.run())).code).toBe("MISSING_SIGNATURES");
    expect(provider.control.count("submitTx")).toBe(0);

    await plan.sign({ signers: keysSigner("callback", co).signer });
    expect(statuses(plan)).toEqual({ main: "signed" });
    await plan.run();
    expect(plan.status).toBe("final");
  });

  it("keeps nothing of an addWitnesses call with an argument that is not a witness of a step", async () => {
    const co = testKey();
    const { builder, wallet } = await stepSetup(v);
    const plan = await planOf(
      builder,
      [payTo(alice, 5n * ADA), guard.pubKey({ keyHash: co.keyHash })],
      { payer: wallet },
    );
    await plan.sign();
    const right = witnessSetOf(co.answer(plan.step("main").txHash));
    const wrong = witnessSetOf(co.answer("ab".repeat(32)));
    const error = (await caught(
      plan.addWitnesses(right, wrong),
    )) as TxPlanError<"INVALID_WITNESS">;
    expect(error.code).toBe("INVALID_WITNESS");
    expect(error.details).toEqual({
      reason: "wrongBody",
      argument: 1,
      keyHash: co.keyHash,
    });
    const unread = (await caught(
      plan.addWitnesses("not a witness"),
    )) as TxPlanError<"INVALID_WITNESS">;
    expect(unread.details).toMatchObject({
      reason: "undecodable",
      argument: 0,
    });
    expect(statuses(plan)).toEqual({ main: "built" });
    expect(missingKeys(plan)).toEqual({ main: [co.keyHash] });
  });
});
