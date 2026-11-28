import { randomBytes } from "node:crypto";

import type { NativeScript } from "@meshsdk/core";
import {
  deserializeAddress,
  pubKeyAddress,
  serializeAddressObj,
  serializeRewardAddress,
} from "@meshsdk/core";
import { Crypto } from "@meshsdk/core-cst";

import type { Signer, TxPlanError } from "../../../src/tx-builder";
import type { TxPlan } from "../../../src/tx-builder/plan/plan";
import {
  addWitnesses,
  certificate,
  guard,
  keySigner,
  signedKeyHashes,
  signWitnesses,
  spend,
  TxError,
  TxPlanError as TxPlanErrorClass,
  validity,
} from "../../../src/tx-builder";
import { recordOf } from "../../../src/tx-builder/plan/plan";
import { cip30Wallet } from "../../cip30-wallet";
import { hashSigner, keysSigner, testKey } from "../hash-signer-util";
import {
  builderOf,
  caught,
  pay,
  submitterOf,
  walletOf,
  words,
} from "./plan-emulator-util";
import {
  ADA,
  alice,
  bob,
  carol,
  paidTo,
  payTo,
  refusal,
  stepSetup,
  VALIDATORS,
  witnessSetOf,
} from "./run-util";
import { watchStore } from "./store-util";

// Signing a plan: the payer by default, the signers a call names, a co-signer's
// witnesses through addWitnesses, what each step still misses, and the rule that a witness counts
// for the key of its own public key. Nothing is sent while a key is missing.

const statuses = (plan: TxPlan) =>
  Object.fromEntries(plan.steps.map((step) => [step.name, step.status]));

const missingKeys = (plan: TxPlan) =>
  Object.fromEntries(
    plan.steps.map((step) => [step.name, step.missing.map((k) => k.keyHash)]),
  );

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

const keyOf = async (wallet: { getChangeAddress(): Promise<string> }) =>
  deserializeAddress(await wallet.getChangeAddress()).pubKeyHash;

/** The key hashes of the vkey witnesses a transaction holds */
const signedBy = async (tx: string) => (await signedKeyHashes(tx)).sort();

/** The key hashes of the witnesses the record of a plan holds for its first step */
const recordedKeys = (plan: TxPlan) =>
  recordOf(plan)
    .steps[0]!.witnesses.map((w) => w.keyHash)
    .sort();

describe.each(VALIDATORS)("signing a plan (%s)", (v) => {
  beforeAll(() => Crypto.ready());

  it("signs every step with the payer when the call names no signer, before anything is sent", async () => {
    const { emulator, provider, builder, wallet } = await stepSetup(v);
    const plan = await builder.plan(
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
    const plan = await builder.plan(
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
    const plan = await builder.plan(
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
    const plan = await builder.plan(
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
    expect(recordOf(plan).steps[0]!.witnesses.map((w) => w.keyHash)).toContain(
      other.keyHash,
    );
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
    const plan = await builder.plan(
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

describe.each(VALIDATORS)(
  "signing a plan on TxEmulator: who signs, what is kept, how long a signer is waited for (%s)",
  (v) => {
    beforeAll(() => Crypto.ready());

    it("signs with the call's signers, else with a payer that can sign", async () => {
      const { provider, builder, wallet, address } = await stepSetup(v);
      // A payer given as an address cannot sign
      const byAddress = await builder.plan(pay(), { payer: address });
      const error = (await caught(
        byAddress.sign(),
      )) as TxPlanError<"MISSING_SIGNATURES">;
      expectCode(error, "MISSING_SIGNATURES");
      expect(error.step).toBe("main");
      expect(error.details.missing.map((k) => k.keyHash)).toEqual([
        await keyOf(wallet),
      ]);
      expectCode(await caught(byAddress.run()), "MISSING_SIGNATURES");
      expect(statuses(byAddress)).toEqual({ main: "built" });
      expect(provider.control.count("submitTx")).toBe(0);
      await byAddress.sign({ signers: wallet });
      expect(statuses(byAddress)).toEqual({ main: "signed" });
      expect(byAddress.step("main").missing).toEqual([]);

      // The call's signers, through run()
      const viaRun = await builder.plan(pay(), { payer: address });
      await viaRun.run({ signers: [wallet] });
      expect(viaRun.status).toBe("final");

      // The payer itself
      const viaPayer = await builder.plan(pay(), { payer: wallet });
      await viaPayer.sign();
      expect(statuses(viaPayer)).toEqual({ main: "signed" });
      expect(await signedBy(viaPayer.step("main").signedTx!)).toEqual([
        await keyOf(wallet),
      ]);
    });

    it("is MISSING_SIGNATURES for an empty list of signers and no payer that signs; the payer signs in place of an empty list", async () => {
      const { provider, builder, wallet, address } = await stepSetup(v);
      const byAddress = await builder.plan(pay(), { payer: address });
      const error = (await caught(
        byAddress.sign({ signers: [] }),
      )) as TxPlanError<"MISSING_SIGNATURES">;
      expectCode(error, "MISSING_SIGNATURES");
      expect(error.details.missing.map((k) => k.keyHash)).toEqual([
        await keyOf(wallet),
      ]);
      expectCode(
        await caught(byAddress.run({ signers: [] })),
        "MISSING_SIGNATURES",
      );
      expect(statuses(byAddress)).toEqual({ main: "built" });
      expect(provider.control.count("submitTx")).toBe(0);
      await byAddress.sign({ signers: wallet });
      // With no key missing, sign() asks nobody and changes nothing
      const signedTx = byAddress.step("main").signedTx;
      await byAddress.sign();
      await byAddress.sign({ signers: [] });
      expect(statuses(byAddress)).toEqual({ main: "signed" });
      expect(byAddress.step("main").signedTx).toBe(signedTx);

      // ... and the payer signs in place of an empty list
      const viaSign = await builder.plan(pay(), { payer: wallet });
      await viaSign.sign({ signers: [] });
      expect(statuses(viaSign)).toEqual({ main: "signed" });
      const viaRun = await builder.plan(pay(), { payer: wallet });
      await viaRun.run({ signers: [] });
      expect(viaRun.status).toBe("final");
    });

    it("changes nothing when the signer declines", async () => {
      const { provider, builder, wallet } = await stepSetup(v);
      const plan = await builder.plan(pay(), { payer: wallet });
      const { txHash, tx } = plan.step("main");
      const declining = {
        signTx: async () => {
          throw { code: 2, info: "declined" };
        },
      };
      const error = await caught(plan.sign({ signers: declining }));
      expectCode(error, "SIGN_DECLINED");
      expect(error.step).toBe("main");
      expect(statuses(plan)).toEqual({ main: "built" });
      expect(plan.step("main").txHash).toBe(txHash);
      expect(plan.step("main").tx).toBe(tx);
      expect(recordOf(plan).steps[0]!.witnesses).toEqual([]);
      expectCode(
        await caught(plan.run({ signers: declining })),
        "SIGN_DECLINED",
      );
      expect(statuses(plan)).toEqual({ main: "built" });
      expect(recordOf(plan).steps[0]!.witnesses).toEqual([]);
      expect(provider.control.count("submitTx")).toBe(0);
    });

    it("takes no signature on a step that was sent and refused: its bytes stay, and past its end of validity it is EXPIRED, not unsent", async () => {
      const { emulator, builder, wallet } = await stepSetup(v);
      const outsider = await walletOf(1);
      const refusing = submitterOf(async () => {
        throw refusal();
      });
      const plan = await builder.plan(pay(), {
        payer: wallet,
        extraKeyWitnesses: 1,
      });
      expectCode(await caught(plan.run({ submitter: refusing })), "REJECTED");
      expect(statuses(plan)).toEqual({ main: "rejected" });
      const sent = plan.step("main").signedTx;
      expect(refusing.calls).toEqual([sent]);
      const held = recordedKeys(plan);
      // A signer and addWitnesses offer a key the fee would count: the bytes sent do not change
      await plan.sign({
        signers: { signTx: async (tx: string) => signWitnesses(outsider, tx) },
      });
      await plan.addWitnesses(
        await signWitnesses(outsider, plan.step("main").tx),
      );
      expect(statuses(plan)).toEqual({ main: "rejected" });
      expect(plan.step("main").signedTx).toBe(sent);
      expect(recordedKeys(plan)).toEqual(held);
      expect(held).not.toContain(await keyOf(outsider));

      // Past its end of validity, the step that was sent is EXPIRED, without unsent
      emulator.advanceTo({ time: plan.until! + 1_000 });
      const counting = submitterOf((tx) => emulator.submitTx(tx));
      const error = (await caught(
        plan.run({ submitter: counting }),
      )) as TxPlanError<"EXPIRED">;
      expectCode(error, "EXPIRED");
      expect(error.step).toBe("main");
      expect(error.details.unsent).toBeUndefined();
      expect(error.message).not.toContain("never sent");
      expect(counting.calls).toEqual([]);
      expect(statuses(plan)).toEqual({ main: "expired" });
      expect(plan.status).toBe("stopped");
    });

    it("is MISSING_SIGNATURES before the ledger, each missing key its hash and its roles, and addWitnesses completes the step", async () => {
      const { builder, wallet, provider } = await stepSetup(v);
      const cosigner = await walletOf(1);
      const cosignerKey = await keyOf(cosigner);
      const plan = await builder.plan(
        [pay(), guard.pubKey({ keyHash: cosignerKey })],
        { payer: wallet },
      );
      const error = (await caught(
        plan.run(),
      )) as TxPlanError<"MISSING_SIGNATURES">;
      expectCode(error, "MISSING_SIGNATURES");
      // Each missing key is its hash and its roles, and nothing else
      expect(error.details.missing).toStrictEqual([
        { keyHash: cosignerKey, roles: ["guard"] },
      ]);
      expect(missingKeys(plan)).toEqual({ main: [cosignerKey] });
      expect(statuses(plan)).toEqual({ main: "built" });
      expect(plan.step("main").signedTx).toBeUndefined();
      expect(provider.control.count("submitTx")).toBe(0);

      await plan.addWitnesses(
        await signWitnesses(cosigner, plan.step("main").tx),
      );
      expect(statuses(plan)).toEqual({ main: "signed" });
      await plan.run();
      expect(plan.status).toBe("final");
    });

    it("records each required key as its hash and its roles, through toJSON, a store and resume", async () => {
      const store = watchStore();
      const { builder, wallet, provider } = await stepSetup(v, {
        builder: { store },
      });
      const walletKey = await keyOf(wallet);
      const cosignerKey = await keyOf(await walletOf(1));
      const plan = await builder.plan(
        [pay(), guard.pubKey({ keyHash: cosignerKey })],
        { id: "pay", payer: wallet },
      );
      const keys = [
        { keyHash: walletKey, roles: ["input"] },
        { keyHash: cosignerKey, roles: ["guard"] },
      ];
      const byHash = (list: readonly { keyHash: string }[]) =>
        [...list].sort((a, b) => a.keyHash.localeCompare(b.keyHash));
      const step = plan.step("main");
      expect(byHash(step.signers.keys)).toStrictEqual(byHash(keys));
      const json = plan.toJSON();
      const recorded = (
        json.steps[0]!.tx.built as { signers: { keys: unknown } }
      ).signers.keys;
      expect(recorded).toStrictEqual(step.signers.keys);
      expect(await store.load("pay")).toStrictEqual(json);

      const again = await builderOf(provider, { store }).resume("pay");
      expect(again.toJSON()).toStrictEqual(json);
      expect(again.step("main").signers.keys).toStrictEqual(step.signers.keys);
      expect(again.step("main").missing).toStrictEqual(step.missing);
      expect(byHash(again.step("main").missing)).toStrictEqual(byHash(keys));
    });

    it("takes only the vkey witnesses of a full transaction, keeping body and hash", async () => {
      const { builder, wallet } = await stepSetup(v);
      const fullTx = {
        signTx: async (tx: string) => wallet.signTx(tx, true, true),
      };
      const plan = await builder.plan(pay(), { payer: wallet });
      const { tx, txHash } = plan.step("main");
      await plan.sign({ signers: fullTx });
      const step = plan.step("main");
      expect(step.status).toBe("signed");
      expect(step.txHash).toBe(txHash);
      expect(step.tx).toBe(tx);
      expect(await signedBy(step.signedTx!)).toEqual([await keyOf(wallet)]);
      // The signed transaction differs from the unsigned one only in its witness set
      expect(step.signedTx!.length).toBeGreaterThan(tx.length);

      const other = await builder.plan(pay(), { payer: wallet });
      const otherStep = other.step("main");
      await other.addWitnesses(await wallet.signTx(otherStep.tx, true, true));
      expect(statuses(other)).toEqual({ main: "signed" });
      expect(other.step("main").txHash).toBe(otherStep.txHash);
      await other.run();
      expect(other.status).toBe("final");
    });

    it("sends nothing for a signature that came after the step's end of validity: EXPIRED (unsent) once it is dead, CONFIRM_TIMEOUT while the margin runs", async () => {
      const { emulator, builder, wallet } = await stepSetup(v);
      const counting = submitterOf((tx) => emulator.submitTx(tx));
      let plan: TxPlan;
      const late = {
        signTx: async (tx: string) => {
          emulator.advanceTo({ time: plan.until! + 1_000 });
          return wallet.signTx(tx, true);
        },
      };
      // A margin keeps the step from being dead past its end of validity: nothing is sent
      plan = await builder.plan(pay(), {
        payer: wallet,
        expiryMarginMs: 600_000,
      });
      const waiting = await caught(
        plan.run({ signers: late, submitter: counting, timeoutMs: 100 }),
      );
      expectCode(waiting, "CONFIRM_TIMEOUT");
      expect(statuses(plan)).toEqual({ main: "signed" });
      expect(counting.calls).toEqual([]);

      // Without a margin the step is dead at once
      plan = await builder.plan(pay(), { payer: wallet });
      const error = (await caught(
        plan.run({ signers: late, submitter: counting }),
      )) as TxPlanError<"EXPIRED">;
      expectCode(error, "EXPIRED");
      expect(error.details.unsent).toBe(true);
      expect(counting.calls).toEqual([]);
      expect(statuses(plan)).toEqual({ main: "expired" });
      // The same, seen by the next call: nothing is signed or sent
      const again = (await caught(
        plan.run({ submitter: counting }),
      )) as TxPlanError<"EXPIRED">;
      expect(again.details.unsent).toBe(true);
      expect(counting.calls).toEqual([]);
    });

    it("waits for a signer no longer than the step's end of validity", async () => {
      let tipFails = false;
      const { emulator, builder, wallet } = await stepSetup(v, {
        hooks: {
          fetchLatestBlock: async (forward) => {
            if (tipFails) throw new Error("no tip now");
            return forward();
          },
        },
      });
      let asked = 0;
      const silent = {
        signTx: () => {
          asked += 1;
          return new Promise<string>(() => undefined);
        },
      };
      const plan = await builder.plan(pay(), { payer: wallet, ttlMs: 1_000 });
      const { txHash } = plan.step("main");
      const started = Date.now();
      const error = (await caught(
        plan.sign({ signers: silent }),
      )) as TxPlanError<"SIGNER_FAILED">;
      const waited = Date.now() - started;
      expectCode(error, "SIGNER_FAILED");
      expect(error.details.reason).toBe("timeout");
      expect(error.step).toBe("main");
      expect(waited).toBeGreaterThanOrEqual(900);
      expect(waited).toBeLessThan(3_000);
      expect(statuses(plan)).toEqual({ main: "built" });
      expect(plan.step("main").txHash).toBe(txHash);
      expect(asked).toBe(1);

      // An aborted signal ends the wait sooner
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 50);
      const aborted = await caught(
        plan.sign({ signers: silent, signal: controller.signal }),
      );
      expectCode(aborted, "ABORTED");

      // Without a tip there is no limit but the signal
      tipFails = true;
      const unbounded = new AbortController();
      setTimeout(() => unbounded.abort(), 1_500);
      const start = Date.now();
      expectCode(
        await caught(plan.sign({ signers: silent, signal: unbounded.signal })),
        "ABORTED",
      );
      expect(Date.now() - start).toBeGreaterThanOrEqual(1_400);
      tipFails = false;

      // Past the end of validity the signer is not asked
      emulator.advanceTo({ time: plan.until! });
      const before = asked;
      const past = (await caught(
        plan.sign({ signers: silent }),
      )) as TxPlanError<"SIGNER_FAILED">;
      expect(past.details.reason).toBe("timeout");
      expect(asked).toBe(before);
    }, 10_000);

    it("waits for a signer of a step whose end of validity is weeks ahead", async () => {
      const { emulator, builder, wallet } = await stepSetup(v);
      const until = builder.timeAt(emulator.slot) + 30 * 86_400_000;
      const slow = {
        signTx: async (tx: string) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return wallet.signTx(tx, true);
        },
      };
      const plan = await builder.plan([pay(), validity({ until })], {
        payer: wallet,
      });
      expect(plan.until).toBe(until);
      await plan.sign({ signers: slow });
      expect(statuses(plan)).toEqual({ main: "signed" });
    });

    it("drops the signatures the fee did not count", async () => {
      const { emulator, builder, wallet } = await stepSetup(v);
      const outsider = await walletOf(1);
      const third = await walletOf(2);
      const payerKey = await keyOf(wallet);
      const outsiderKey = await keyOf(outsider);
      const thirdKey = await keyOf(third);
      /** A signer that also signs with keys the transaction does not call for */
      const generous = (...others: (typeof wallet)[]) => ({
        signTx: async (tx: string) =>
          addWitnesses(
            tx,
            await signWitnesses(wallet, tx),
            ...(await Promise.all(others.map((o) => signWitnesses(o, tx)))),
          ),
      });

      const plain = await builder.plan(pay(), { payer: wallet });
      await plain.sign({ signers: generous(outsider) });
      expect(await signedBy(plain.step("main").signedTx!)).toEqual([payerKey]);
      await plain.run();
      expect(plain.status).toBe("final");

      // The same through addWitnesses
      const added = await builder.plan(pay(), { payer: wallet });
      const { tx } = added.step("main");
      await added.addWitnesses(
        await signWitnesses(wallet, tx),
        await signWitnesses(outsider, tx),
      );
      expect(await signedBy(added.step("main").signedTx!)).toEqual([payerKey]);

      // A key that only a native script of the step names is kept
      const script = { type: "sig" as const, keyHash: outsiderKey };
      const scriptAddress = builder.scriptAddress(script);
      const locked = emulator.fund(scriptAddress, { lovelace: 10_000_000n });
      const native = await builder.plan(
        [spend.native({ utxo: locked, script }), pay()],
        { payer: wallet },
      );
      // The script output pays for it all: the payer's key is not called for, and is dropped
      expect(native.step("main").signers.keyHashes).toEqual([]);
      await native.sign({ signers: generous(outsider) });
      expect(await signedBy(native.step("main").signedTx!)).toEqual([
        outsiderKey,
      ]);
      await native.run();
      expect(native.status).toBe("final");

      // With extraKeyWitnesses: 1, the first outside witness is kept, a second dropped
      const extra = await builder.plan(pay(), {
        payer: wallet,
        extraKeyWitnesses: 1,
      });
      await extra.sign({ signers: generous(outsider) });
      await extra.addWitnesses(
        await signWitnesses(third, extra.step("main").tx),
      );
      expect(await signedBy(extra.step("main").signedTx!)).toEqual(
        [payerKey, outsiderKey].sort(),
      );
      expect(recordedKeys(extra)).not.toContain(thirdKey);
      await extra.run();
      expect(extra.status).toBe("final");
    });
  },
);

describe.each(VALIDATORS)(
  "a plan on TxEmulator: the payer gives only the keys it is asked for (%s)",
  (v) => {
    type Wallet = Awaited<ReturnType<typeof walletOf>>;

    /**
     * A CIP-30 payer over the funded wallet whose `signTx` answers with the witness of the account
     * it is on, recording each request
     */
    const switchingPayer = async (
      emulator: Parameters<typeof cip30Wallet>[0]["fetcher"],
      first: Wallet,
    ) => {
      const api = await cip30Wallet({ words, fetcher: emulator });
      let account = first;
      const calls: string[] = [];
      const payer = {
        ...api,
        signTx: async (tx: string) => {
          calls.push(tx);
          return signWitnesses(account, tx);
        },
      };
      return {
        payer,
        calls,
        onAccount: (wallet: Wallet) => (account = wallet),
      };
    };

    it("keeps no witness of another account from the payer in sign(), with room for one, and the co-signer's witness added later is kept", async () => {
      const { emulator, builder, wallet } = await stepSetup(v);
      const other = await walletOf(1);
      const coSigner = await walletOf(2);
      const payerKey = await keyOf(wallet);
      const coSignerKey = await keyOf(coSigner);
      const { payer, calls, onAccount } = await switchingPayer(emulator, other);
      const plan = await builder.plan(pay(), { payer, extraKeyWitnesses: 1 });
      await plan.sign();
      expect(calls).toHaveLength(1);
      expect(recordedKeys(plan)).toEqual([]);
      expect(statuses(plan)).toEqual({ main: "built" });
      await plan.addWitnesses(
        await signWitnesses(coSigner, plan.step("main").tx),
      );
      expect(recordedKeys(plan)).toEqual([coSignerKey]);
      onAccount(wallet);
      await plan.sign();
      expect(calls).toHaveLength(2);
      expect(statuses(plan)).toEqual({ main: "signed" });
      expect(await signedBy(plan.step("main").signedTx!)).toEqual(
        [payerKey, coSignerKey].sort(),
      );
      await plan.run();
      expect(plan.status).toBe("final");
    });

    it("keeps no witness of another account from the payer in run(), with room for one, and the co-signer's witness added later is kept", async () => {
      const { emulator, builder, wallet, provider } = await stepSetup(v);
      const other = await walletOf(1);
      const coSigner = await walletOf(2);
      const payerKey = await keyOf(wallet);
      const coSignerKey = await keyOf(coSigner);
      const { payer, calls, onAccount } = await switchingPayer(emulator, other);
      const plan = await builder.plan(pay(), { payer, extraKeyWitnesses: 1 });
      expectCode(await caught(plan.run()), "MISSING_SIGNATURES");
      expect(calls).toHaveLength(1);
      expect(recordedKeys(plan)).toEqual([]);
      expect(statuses(plan)).toEqual({ main: "built" });
      expect(provider.control.count("submitTx")).toBe(0);
      await plan.addWitnesses(
        await signWitnesses(coSigner, plan.step("main").tx),
      );
      expect(recordedKeys(plan)).toEqual([coSignerKey]);
      onAccount(wallet);
      await plan.run();
      expect(calls).toHaveLength(2);
      expect(plan.status).toBe("final");
      expect(recordedKeys(plan)).toEqual([payerKey, coSignerKey].sort());
    });

    it("keeps the payer's own witness and drops the other one it gives with it, where a signer named fills the slot", async () => {
      const { emulator, builder, wallet } = await stepSetup(v);
      const other = await walletOf(1);
      const payerKey = await keyOf(wallet);
      const otherKey = await keyOf(other);
      const api = await cip30Wallet({ words, fetcher: emulator });
      const both = {
        signTx: async (tx: string) =>
          addWitnesses(
            tx,
            await signWitnesses(wallet, tx),
            await signWitnesses(other, tx),
          ),
      };
      const options = { extraKeyWitnesses: 1 };

      const byPayer = await builder.plan(pay(), {
        ...options,
        payer: { ...api, signTx: both.signTx },
      });
      await byPayer.sign();
      expect(await signedBy(byPayer.step("main").signedTx!)).toEqual([
        payerKey,
      ]);

      const named = await builder.plan(pay(), { ...options, payer: wallet });
      await named.sign({ signers: both });
      expect(await signedBy(named.step("main").signedTx!)).toEqual(
        [payerKey, otherKey].sort(),
      );
      await named.run();
      expect(named.status).toBe("final");

      // The same through run()
      const viaRun = await builder.plan(pay(), { ...options, payer: wallet });
      await viaRun.run({ signers: both });
      expect(viaRun.status).toBe("final");
      expect(recordedKeys(viaRun)).toEqual([payerKey, otherKey].sort());
    });

    it.each(["a CIP-30 api", "a signTxWitnesses wallet"] as const)(
      "does not ask %s again when every key has signed",
      async (form) => {
        const { emulator, builder } = await stepSetup(v);
        const api = await cip30Wallet({ words, fetcher: emulator });
        let calls = 0;
        const payer =
          form === "a CIP-30 api"
            ? {
                ...api,
                signTx: (tx: string) => {
                  calls += 1;
                  return api.signTx(tx);
                },
              }
            : {
                ...api,
                signTxWitnesses: (tx: string, keyHashes?: string[]) => {
                  calls += 1;
                  return api.wallet.signTxWitnesses(tx, keyHashes);
                },
              };
        const plan = await builder.plan(pay(), { payer });
        await plan.sign();
        expect(statuses(plan)).toEqual({ main: "signed" });
        expect(calls).toBe(1);
        await plan.sign();
        await plan.sign({ signers: [] });
        expect(calls).toBe(1);
        await plan.run();
        expect(plan.status).toBe("final");
        expect(calls).toBe(1);
      },
    );
  },
);

describe.each(VALIDATORS)(
  "a plan with a key signer on TxEmulator (%s)",
  (v) => {
    it("sends a payment signed by keySigner to final", async () => {
      const { emulator, builder } = await stepSetup(v);
      await Crypto.ready();
      // A key made here: only its hash and its address are compared
      const key = randomBytes(32).toString("hex");
      const keyHash = Crypto.Ed25519PrivateKey.fromNormalBytes(
        Buffer.from(key, "hex"),
      )
        .toPublic()
        .hash()
        .hex() as string;
      const address = serializeAddressObj(pubKeyAddress(keyHash), 0);
      emulator.fund(address, { lovelace: 100_000_000n });

      const plan = await builder.plan(pay(), { payer: address });
      await plan.run({ signers: keySigner(key) });
      expect(plan.status).toBe("final");
      expect(await signedBy(plan.step("main").signedTx!)).toEqual([keyHash]);
      const json = JSON.stringify(plan.toJSON());
      expect(json.includes(key)).toBe(false);

      // One list of signers serves every transaction: a key signer not asked for signs nothing
      const other = await builder.plan(pay(), { payer: address });
      await other.run({
        signers: [keySigner(randomBytes(32).toString("hex")), keySigner(key)],
      });
      expect(other.status).toBe("final");
      expect(await signedBy(other.step("main").signedTx!)).toEqual([keyHash]);
    });
  },
);

describe.each(
  VALIDATORS.flatMap((v) =>
    (["object", "callback"] as const).map((form) => [form, v] as const),
  ),
)(
  "a plan with a signer of transaction hashes (%s) on TxEmulator (%s)",
  (form, v) => {
    beforeAll(() => Crypto.ready());

    it("signs in sign() and run()", async () => {
      const { emulator, builder } = await stepSetup(v);
      const key = testKey();
      emulator.fund(key.address, { lovelace: 100_000_000n });

      const viaSign = await builder.plan(pay(), { payer: key.address });
      const step = viaSign.step("main");
      const signer = keysSigner(form, key);
      await viaSign.sign({ signers: signer.signer });
      expect(statuses(viaSign)).toEqual({ main: "signed" });
      expect(await signedBy(viaSign.step("main").signedTx!)).toEqual([
        key.keyHash,
      ]);
      expect(signer.requests).toHaveLength(1);
      expect(signer.requests[0]!.txHash).toBe(step.txHash);
      expect(signer.requests[0]!.tx).toBe(step.tx);
      expect(signer.requests[0]!.keys).toEqual([
        { keyHash: key.keyHash, roles: ["input"] },
      ]);
      await viaSign.run();
      expect(viaSign.status).toBe("final");

      const viaRun = await builder.plan(pay(), { payer: key.address });
      await viaRun.run({ signers: [keysSigner(form, key).signer] });
      expect(viaRun.status).toBe("final");
    });

    it("hands each signer the keys not signed yet, skips a signer of hashes with none left, and passes the signal", async () => {
      const { builder, wallet } = await stepSetup(v);
      const payerKey = await keyOf(wallet);
      const first = testKey();
      const second = testKey();
      const lists: (readonly string[] | undefined)[] = [];
      /** The payer's wallet, recording the keys it is asked for */
      const recorded = (
        ...[tx, keyHashes]: Parameters<typeof wallet.signTxWitnesses>
      ) => {
        lists.push(keyHashes);
        return wallet.signTxWitnesses(tx, keyHashes);
      };
      const plan = await builder.plan(
        [
          pay(),
          guard.pubKey({ keyHash: first.keyHash }),
          guard.pubKey({ keyHash: second.keyHash }),
        ],
        { payer: wallet },
      );
      const both = keysSigner(form, first, second);
      const late = keysSigner(form, first, second);
      const controller = new AbortController();
      await plan.sign({
        signers: [
          { signTxWitnesses: recorded },
          both.signer,
          late.signer,
          { signTxWitnesses: recorded },
        ],
        signal: controller.signal,
      });
      expect(statuses(plan)).toEqual({ main: "signed" });
      expect([...lists[0]!].sort()).toEqual(
        [payerKey, first.keyHash, second.keyHash].sort(),
      );
      expect(both.requests).toHaveLength(1);
      expect(both.requests[0]!.keys).toEqual([
        { keyHash: first.keyHash, roles: ["guard"] },
        { keyHash: second.keyHash, roles: ["guard"] },
      ]);
      expect(both.requests[0]!.signal).toBe(controller.signal);
      // Nothing left: the signer of hashes is not asked, a wallet still is, with an empty list
      expect(late.requests).toEqual([]);
      expect(lists).toHaveLength(2);
      expect(lists[1]).toEqual([]);
      expect(await signedBy(plan.step("main").signedTx!)).toEqual(
        [payerKey, first.keyHash, second.keyHash].sort(),
      );

      // A signer of hashes after a wallet is asked only for what the wallet left
      const after = await builder.plan(
        [pay(), guard.pubKey({ keyHash: first.keyHash })],
        { payer: wallet },
      );
      const cosigner = keysSigner(form, first);
      await after.sign({ signers: [wallet, cosigner.signer] });
      expect(cosigner.requests[0]!.keys).toEqual([
        { keyHash: first.keyHash, roles: ["guard"] },
      ]);
      expect("signal" in cosigner.requests[0]!).toBe(false);
      expect(statuses(after)).toEqual({ main: "signed" });
    });

    it("asks with the roles of the step's keys: payment, stake and native script keys, each once, the list shrinking as keys sign", async () => {
      const { emulator, builder } = await stepSetup(v);
      const payment = testKey();
      const stake = testKey();
      const named = testKey();
      emulator.fund(payment.address, { lovelace: 100_000_000n });
      // A script that the payment key and a key only the script names both sign
      const native: NativeScript = {
        type: "all",
        scripts: [
          { type: "sig", keyHash: payment.keyHash },
          { type: "sig", keyHash: named.keyHash },
        ],
      };
      const scriptAddress = builder.scriptAddress(native);
      // Too little to pay on its own: the payer's input is selected too
      emulator.fund(scriptAddress, { lovelace: 2_000_000n });

      const plan = await builder.plan(
        [
          // The guard comes first: the roles keep the order of SignerRole all the same
          guard.pubKey({ keyHash: payment.keyHash }),
          certificate.stakeRegistration({
            stake: serializeRewardAddress(stake.keyHash),
          }),
          spend.native({
            utxo: emulator.utxos({ address: scriptAddress })[0]!,
            script: native,
          }),
          pay(),
        ],
        { payer: payment.address },
      );
      const step = plan.step("main");
      expect(step.signers.keys).toEqual([
        { keyHash: payment.keyHash, roles: ["input", "guard"] },
        { keyHash: stake.keyHash, roles: ["certificate"] },
      ]);

      const first = keysSigner(form, payment);
      const rest = keysSigner(form, stake, named);
      await plan.sign({ signers: [first.signer, rest.signer] });

      // Every key of the step: the required ones in the order of signers.keys, the payment
      // key also named by the script, then the key only the script names
      const request = first.requests[0]!;
      expect(request.keys).toEqual([
        { keyHash: payment.keyHash, roles: ["input", "guard", "nativeScript"] },
        { keyHash: stake.keyHash, roles: ["certificate"] },
        { keyHash: named.keyHash, roles: ["nativeScript"] },
      ]);
      expect("keyHashes" in request).toBe(false);
      expect(Object.isFrozen(request)).toBe(true);
      expect(Object.isFrozen(request.keys)).toBe(true);
      expect(
        request.keys!.every(
          (key) => Object.isFrozen(key) && Object.isFrozen(key.roles),
        ),
      ).toBe(true);
      // The next signer is asked only for the keys that have not signed
      expect(rest.requests[0]!.keys).toEqual([
        { keyHash: stake.keyHash, roles: ["certificate"] },
        { keyHash: named.keyHash, roles: ["nativeScript"] },
      ]);
      // What a signer is handed is a copy: the step's data is unchanged
      expect(step.signers.keys[0]!.roles).toEqual(["input", "guard"]);
      expect(plan.step("main").signers.keys[0]!.roles).toEqual([
        "input",
        "guard",
      ]);

      expect(statuses(plan)).toEqual({ main: "signed" });
      expect(await signedBy(plan.step("main").signedTx!)).toEqual(
        [payment.keyHash, stake.keyHash, named.keyHash].sort(),
      );
      await plan.run();
      expect(plan.status).toBe("final");
    });

    it("is SIGNER_FAILED for a signature that does not verify, SIGN_DECLINED for a decline, and changes nothing", async () => {
      const { builder, wallet, provider } = await stepSetup(v);
      const key = testKey();
      const plan = await builder.plan(
        [pay(), guard.pubKey({ keyHash: key.keyHash })],
        { payer: wallet },
      );
      const { txHash } = plan.step("main");
      const forged = hashSigner(form, () => [
        { vkey: key.vkey, signature: key.sign("cd".repeat(32)) },
      ]);
      const failed = (await caught(
        plan.sign({ signers: [wallet, forged.signer] }),
      )) as TxPlanError<"SIGNER_FAILED">;
      expectCode(failed, "SIGNER_FAILED");
      expect(failed.details.reason).toBe("error");
      expect(failed.step).toBe("main");
      expect(statuses(plan)).toEqual({ main: "built" });
      // The wallet's signature, asked first, is kept
      expect(missingKeys(plan)).toEqual({ main: [key.keyHash] });

      const declined = new TxPlanErrorClass("SIGN_DECLINED", "not today");
      const declining = hashSigner(form, () => Promise.reject(declined));
      const error = await caught(plan.run({ signers: declining.signer }));
      expectCode(error, "SIGN_DECLINED");
      expect(error).not.toBe(declined);
      expect((error as TxPlanError).cause).toBe(declined);
      expect(statuses(plan)).toEqual({ main: "built" });
      expect(plan.step("main").txHash).toBe(txHash);
      expect(provider.control.count("submitTx")).toBe(0);

      await plan.sign({ signers: keysSigner(form, key).signer });
      expect(statuses(plan)).toEqual({ main: "signed" });
    });

    it("waits for a signer of hashes no longer than the step's end of validity", async () => {
      const { builder, wallet } = await stepSetup(v);
      const key = testKey();
      const plan = await builder.plan(
        [pay(), guard.pubKey({ keyHash: key.keyHash })],
        { payer: wallet, ttlMs: 1_000 },
      );
      const silent = hashSigner(form, () => new Promise(() => undefined));
      const error = (await caught(
        plan.sign({ signers: silent.signer }),
      )) as TxPlanError<"SIGNER_FAILED">;
      expectCode(error, "SIGNER_FAILED");
      expect(error.details.reason).toBe("timeout");
      expect(silent.requests).toHaveLength(1);
      expect(statuses(plan)).toEqual({ main: "built" });
    }, 10_000);

    it("does not hold a signer of hashes with no key left to the step's end of validity", async () => {
      const { builder, wallet } = await stepSetup(v);
      const realNow = Date.now;
      /** The payer's wallet, which signs every key; the clock is then past the deadline */
      const lateWallet = {
        signTxWitnesses: async (
          ...[tx, keyHashes]: Parameters<typeof wallet.signTxWitnesses>
        ) => {
          const witnesses = await wallet.signTxWitnesses(tx, keyHashes);
          Date.now = () => realNow() + 3_600_000;
          return witnesses;
        },
      };
      /** The error of `sign` with the wallet and then `next`, or undefined when it signs */
      const signWith = async (plan: TxPlan, next: Signer): Promise<unknown> => {
        try {
          await plan.sign({ signers: [lateWallet, next] });
          return undefined;
        } catch (error) {
          return error;
        } finally {
          Date.now = realNow;
        }
      };

      const plan = await builder.plan(pay(), {
        payer: wallet,
        ttlMs: 60_000,
      });
      const hashes = keysSigner(form, testKey());
      expect(await signWith(plan, hashes.signer)).toBeUndefined();
      expect(hashes.requests).toEqual([]);
      expect(statuses(plan)).toEqual({ main: "signed" });

      // The deadline has passed: a wallet asked next is not waited for
      const other = await builder.plan(pay(), {
        payer: wallet,
        ttlMs: 60_000,
      });
      const timedOut = (await signWith(other, {
        signTxWitnesses: () => Promise.resolve("a0"),
      })) as TxPlanError<"SIGNER_FAILED">;
      expectCode(timedOut, "SIGNER_FAILED");
      expect(timedOut.details.reason).toBe("timeout");
    });
  },
);
