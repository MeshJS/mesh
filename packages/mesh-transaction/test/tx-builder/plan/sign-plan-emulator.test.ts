import { randomBytes } from "node:crypto";

import {
  deserializeAddress,
  pubKeyAddress,
  serializeAddressObj,
} from "@meshsdk/core";
import { Crypto } from "@meshsdk/core-cst";

import type { BuiltTx, Signer, TxPlanError } from "../../../src/tx-builder";
import {
  addWitnesses,
  guard,
  keySigner,
  signWitnesses,
  spend,
  TxError,
  TxPlanError as TxPlanErrorClass,
  validity,
} from "../../../src/tx-builder";
import { recordOf } from "../../../src/tx-builder/plan/plan";
import { hashSigner, keysSigner, testKey } from "../hash-signer-util";
import {
  builderOf,
  caught,
  pay,
  setup,
  submitterOf,
  walletOf,
} from "./plan-emulator-util";
import { watchStore } from "./store-util";

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

const keyOf = async (wallet: { getChangeAddress(): Promise<string> }) =>
  deserializeAddress(await wallet.getChangeAddress()).pubKeyHash;

/** The key hashes of the vkey witnesses a transaction holds */
const signedBy = async (tx: string) => {
  const { signedKeyHashes } = await import("../../../src/tx-builder");
  return (await signedKeyHashes(tx)).sort();
};

describe("TxPlan signing on TxEmulator", () => {
  it("signs with the call's signers, else with a payer that can sign", async () => {
    const { builder, wallet, address } = await setup();
    // A payer given as an address cannot sign
    const byAddress = builder.plan(pay(), { payer: address });
    await byAddress.build();
    const error = (await caught(
      byAddress.sign(),
    )) as TxPlanError<"MISSING_SIGNATURES">;
    expectCode(error, "MISSING_SIGNATURES");
    expect(error.details.missing.map((k) => k.keyHash)).toEqual([
      await keyOf(wallet),
    ]);
    expectCode(await caught(byAddress.send()), "MISSING_SIGNATURES");
    expect(byAddress.status).toBe("built");
    await byAddress.sign({ signers: wallet });
    expect(byAddress.status).toBe("signed");
    expect(byAddress.missing).toEqual([]);

    // The call's signers, through send()
    const viaSend = builder.plan(pay(), { payer: address });
    await viaSend.send({ signers: [wallet], waitFor: "included" });
    expect(viaSend.status).toBe("final");

    // The payer itself
    const viaPayer = builder.plan(pay(), { payer: wallet });
    await viaPayer.build();
    await viaPayer.sign();
    expect(viaPayer.status).toBe("signed");
    expect(await signedBy(viaPayer.signedTx!)).toEqual([await keyOf(wallet)]);
  });

  it("is MISSING_SIGNATURES with no signer at all, also when no key is missing", async () => {
    const { builder, wallet, address } = await setup();
    const byAddress = builder.plan(pay(), { payer: address });
    await byAddress.build();
    await byAddress.sign({ signers: wallet });
    expect(byAddress.status).toBe("signed");
    const error = (await caught(
      byAddress.sign(),
    )) as TxPlanError<"MISSING_SIGNATURES">;
    expectCode(error, "MISSING_SIGNATURES");
    expect(error.details.missing).toEqual([]);
    // An empty list of signers is no signer
    expectCode(
      await caught(byAddress.sign({ signers: [] })),
      "MISSING_SIGNATURES",
    );
    expect(byAddress.status).toBe("signed");

    // ... and the payer signs in its place
    const viaSign = builder.plan(pay(), { payer: wallet });
    await viaSign.build();
    await viaSign.sign({ signers: [] });
    expect(viaSign.status).toBe("signed");
    const viaSend = builder.plan(pay(), { payer: wallet });
    await viaSend.send({ signers: [], waitFor: "included" });
    expect(viaSend.status).toBe("final");
  });

  it("changes nothing when the signer declines", async () => {
    const { builder, wallet } = await setup();
    const plan = builder.plan(pay(), { payer: wallet });
    const built = await plan.build();
    const declining = {
      signTx: async () => {
        throw { code: 2, info: "declined" };
      },
    };
    expectCode(
      await caught(plan.sign({ signers: declining })),
      "SIGN_DECLINED",
    );
    expect(plan.status).toBe("built");
    expect(plan.txHash).toBe(built.txHash);
    expect(recordOf(plan).attempts[0]!.witnesses).toEqual([]);
    expectCode(
      await caught(plan.send({ signers: declining })),
      "SIGN_DECLINED",
    );
    expect(plan.status).toBe("built");
    expect(plan.attempts).toHaveLength(1);
  });

  it("takes signatures on a rejected attempt, which is signed again but not unsent", async () => {
    const { emulator, builder, wallet } = await setup();
    const outsider = await walletOf(1);
    const refusing = submitterOf(async () => {
      throw { kind: "rejected" };
    });
    // A margin keeps the attempt from expiring past its deadline
    const options = {
      payer: wallet,
      extraKeyWitnesses: 1,
      expiryMarginMs: 600_000,
    };
    const plan = builder.plan(pay(), options);
    expectCode(await caught(plan.send({ submitter: refusing })), "REJECTED");
    expect(plan.status).toBe("rejected");
    // A signer adds a key the fee counted: the attempt is signed again
    await plan.sign({
      signers: { signTx: async (tx: string) => signWitnesses(outsider, tx) },
    });
    expect(plan.status).toBe("signed");
    expect(plan.attempts[0]!.sends).toBe(1);

    // Past its deadline, the attempt that was sent is EXPIRED, without unsent
    emulator.advanceTo({ time: plan.attempts[0]!.until + 1_000 });
    const counting = submitterOf((tx) => emulator.submitTx(tx));
    const error = (await caught(
      plan.send({ submitter: counting }),
    )) as TxPlanError<"EXPIRED">;
    expectCode(error, "EXPIRED");
    expect(error.details.unsent).toBeUndefined();
    expect(error.message).not.toContain("never sent");
    expect(counting.calls).toEqual([]);
    expect(plan.status).toBe("signed");

    // The same through addWitnesses
    const added = builder.plan(pay(), options);
    await caught(added.send({ submitter: refusing }));
    expect(added.status).toBe("rejected");
    await added.addWitnesses(await signWitnesses(outsider, added.built!.tx));
    expect(added.status).toBe("signed");
  });

  it("is MISSING_SIGNATURES before the ledger, and addWitnesses completes the attempt", async () => {
    const { builder, wallet, provider } = await setup();
    const cosigner = await walletOf(1);
    const cosignerKey = await keyOf(cosigner);
    const plan = builder.plan([pay(), guard.pubKey({ keyHash: cosignerKey })], {
      payer: wallet,
    });
    const error = (await caught(
      plan.send(),
    )) as TxPlanError<"MISSING_SIGNATURES">;
    expectCode(error, "MISSING_SIGNATURES");
    // Each missing key is its hash and its roles, and nothing else
    expect(error.details.missing).toStrictEqual([
      { keyHash: cosignerKey, roles: ["guard"] },
    ]);
    expect(plan.missing.map((k) => k.keyHash)).toEqual([cosignerKey]);
    expect(plan.status).toBe("built");
    expect(plan.signedTx).toBeUndefined();
    expect(provider.control.count("submitTx")).toBe(0);

    await plan.addWitnesses(await signWitnesses(cosigner, plan.built!.tx));
    expect(plan.status).toBe("signed");
    await plan.send({ waitFor: "included" });
    expect(plan.status).toBe("final");
  });

  it("records each required key as its hash and its roles, through toJSON, a store and resume", async () => {
    const store = watchStore();
    const { builder, wallet, provider } = await setup({ builder: { store } });
    const walletKey = await keyOf(wallet);
    const cosignerKey = await keyOf(await walletOf(1));
    const plan = builder.plan([pay(), guard.pubKey({ keyHash: cosignerKey })], {
      id: "pay",
      payer: wallet,
    });
    await plan.build();
    const keys = [
      { keyHash: walletKey, roles: ["input"] },
      { keyHash: cosignerKey, roles: ["guard"] },
    ];
    const byHash = (list: readonly { keyHash: string }[]) =>
      [...list].sort((a, b) => a.keyHash.localeCompare(b.keyHash));
    expect(byHash(plan.built!.signers.keys)).toStrictEqual(byHash(keys));
    const json = plan.toJSON();
    const recorded = (json.attempts[0] as unknown as { built: BuiltTx }).built
      .signers.keys;
    expect(recorded).toStrictEqual(plan.built!.signers.keys);
    expect(await store.load("pay")).toStrictEqual(json);

    const again = await builderOf(provider, { store }).resume("pay");
    expect(again.toJSON()).toStrictEqual(json);
    expect(again.built!.signers.keys).toStrictEqual(plan.built!.signers.keys);
    expect(again.missing).toStrictEqual(plan.missing);
    expect(byHash(again.missing)).toStrictEqual(byHash(keys));
  });

  it("takes only the vkey witnesses of a full transaction, keeping body and hash", async () => {
    const { builder, wallet } = await setup();
    const fullTx = {
      signTx: async (tx: string) => wallet.signTx(tx, true, true),
    };
    const plan = builder.plan(pay(), { payer: wallet });
    const built = await plan.build();
    await plan.sign({ signers: fullTx });
    expect(plan.status).toBe("signed");
    expect(plan.txHash).toBe(built.txHash);
    expect(plan.built).toBe(built);
    expect(await signedBy(plan.signedTx!)).toEqual([await keyOf(wallet)]);
    // The signed transaction differs from the unsigned one only in its witness set
    expect(plan.signedTx!.length).toBeGreaterThan(built.tx.length);

    const other = builder.plan(pay(), { payer: wallet });
    const otherBuilt = await other.build();
    await other.addWitnesses(await wallet.signTx(otherBuilt.tx, true, true));
    expect(other.status).toBe("signed");
    expect(other.txHash).toBe(otherBuilt.txHash);
    await other.send({ waitFor: "included" });
    expect(other.status).toBe("final");
  });

  it("is INVALID_WITNESS for garbage, a foreign body and a replaced attempt", async () => {
    const { emulator, builder, wallet } = await setup();
    const plan = builder.plan(pay(), { payer: wallet });
    const first = await plan.build();
    const firstWitness = await signWitnesses(wallet, first.tx);
    // Replaced: refused at its delivery, then built anew
    await caught(
      plan.send({
        submitter: submitterOf(async () => {
          throw { kind: "rejected" };
        }),
      }),
    );
    emulator.advanceTo({ slot: emulator.slot + 1 });
    const second = await plan.build();
    expect(second.txHash).not.toBe(first.txHash);

    const foreign = await builder.build(pay(1_000_000n), { payer: wallet });
    const foreignWitness = await signWitnesses(wallet, foreign.tx);
    const cases = [
      ["zz", 0, "undecodable"],
      [foreignWitness, 0, "wrongBody"],
      [firstWitness, 0, "staleAttempt"],
    ] as const;
    for (const [witness, argument, reason] of cases) {
      const error = (await caught(
        plan.addWitnesses(witness),
      )) as TxPlanError<"INVALID_WITNESS">;
      expectCode(error, "INVALID_WITNESS");
      expect(error.details.reason).toBe(reason);
      expect(error.details.argument).toBe(argument);
    }
    // The index of the argument that holds it
    const second2 = (await caught(
      plan.addWitnesses(
        await signWitnesses(await walletOf(1), second.tx),
        firstWitness,
      ),
    )) as TxPlanError<"INVALID_WITNESS">;
    expect(second2.details).toMatchObject({
      reason: "staleAttempt",
      argument: 1,
      keyHash: await keyOf(wallet),
    });
    expect(plan.status).toBe("built");
  });

  it("is EXPIRED (unsent) for a signature that came after the deadline", async () => {
    const { emulator, builder, wallet } = await setup();
    const counting = submitterOf((tx) => emulator.submitTx(tx));
    const late = {
      signTx: async (tx: string) => {
        emulator.advanceTo({ time: plan.attempts[0]!.until + 1_000 });
        return wallet.signTx(tx, true);
      },
    };
    // A margin keeps the attempt signed past its deadline: the body may have left
    const plan = builder.plan(pay(), {
      payer: wallet,
      expiryMarginMs: 600_000,
    });
    const error = (await caught(
      plan.send({ signers: late, submitter: counting }),
    )) as TxPlanError<"EXPIRED">;
    expectCode(error, "EXPIRED");
    expect(error.details.unsent).toBe(true);
    expect(error.details.otherLive).toEqual([]);
    expect(counting.calls).toEqual([]);
    expect(plan.status).toBe("signed");
    // The same, seen right after the observation: nothing is signed
    const again = (await caught(
      plan.send({ submitter: counting }),
    )) as TxPlanError<"EXPIRED">;
    expect(again.details.unsent).toBe(true);
    expect(counting.calls).toEqual([]);
  });

  it("waits for a signer no longer than the attempt's deadline", async () => {
    let tipFails = false;
    const { emulator, builder, wallet } = await setup({
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
    const plan = builder.plan(pay(), { payer: wallet, ttlMs: 1_000 });
    const built = await plan.build();
    const started = Date.now();
    const error = (await caught(
      plan.sign({ signers: silent }),
    )) as TxPlanError<"SIGNER_FAILED">;
    const waited = Date.now() - started;
    expectCode(error, "SIGNER_FAILED");
    expect(error.details.reason).toBe("timeout");
    expect(waited).toBeGreaterThanOrEqual(900);
    expect(waited).toBeLessThan(3_000);
    expect(plan.status).toBe("built");
    expect(plan.txHash).toBe(built.txHash);
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

    // Past the deadline the signer is not asked
    emulator.advanceTo({ time: plan.attempts[0]!.until });
    const before = asked;
    const past = (await caught(
      plan.sign({ signers: silent }),
    )) as TxPlanError<"SIGNER_FAILED">;
    expect(past.details.reason).toBe("timeout");
    expect(asked).toBe(before);
  }, 10_000);

  it("waits for a signer of an attempt whose deadline is weeks ahead", async () => {
    const { emulator, builder, wallet } = await setup();
    const until = emulator.time + 30 * 86_400_000;
    const slow = {
      signTx: async (tx: string) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return wallet.signTx(tx, true);
      },
    };
    const plan = builder.plan([pay(), validity({ until })], {
      payer: wallet,
    });
    await plan.build();
    expect(plan.attempts[0]!.until).toBe(until);
    await plan.sign({ signers: slow });
    expect(plan.status).toBe("signed");
  });

  it("drops the signatures the fee did not count", async () => {
    const { emulator, builder, wallet } = await setup();
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

    const plain = builder.plan(pay(), { payer: wallet });
    await plain.build();
    await plain.sign({ signers: generous(outsider) });
    expect(await signedBy(plain.signedTx!)).toEqual([payerKey]);
    await plain.send({ waitFor: "included" });
    expect(plain.status).toBe("final");

    // The same through addWitnesses
    const added = builder.plan(pay(), { payer: wallet });
    const built = await added.build();
    await added.addWitnesses(
      await signWitnesses(wallet, built.tx),
      await signWitnesses(outsider, built.tx),
    );
    expect(await signedBy(added.signedTx!)).toEqual([payerKey]);

    // A key that only a native script of the attempt names is kept
    const script = { type: "sig" as const, keyHash: outsiderKey };
    const scriptAddress = builder.scriptAddress(script);
    const locked = emulator.fund(scriptAddress, { lovelace: 10_000_000n });
    const native = builder.plan(
      [spend.native({ utxo: locked, script }), pay()],
      { payer: wallet },
    );
    await native.build();
    // The script output pays for it all: the payer's key is not called for, and is dropped
    expect(native.built!.signers.keyHashes).toEqual([]);
    await native.sign({ signers: generous(outsider) });
    expect(await signedBy(native.signedTx!)).toEqual([outsiderKey]);
    await native.send({ waitFor: "included" });
    expect(native.status).toBe("final");

    // With extraKeyWitnesses: 1, the first outside witness is kept, a second dropped
    const extra = builder.plan(pay(), {
      payer: wallet,
      extraKeyWitnesses: 1,
    });
    await extra.build();
    await extra.sign({ signers: generous(outsider) });
    await extra.addWitnesses(await signWitnesses(third, extra.built!.tx));
    expect(await signedBy(extra.signedTx!)).toEqual(
      [payerKey, outsiderKey].sort(),
    );
    expect(
      recordOf(extra).attempts[0]!.witnesses.map((w) => w.keyHash),
    ).not.toContain(thirdKey);
    await extra.send({ waitFor: "included" });
    expect(extra.status).toBe("final");
  });
});

describe("TxPlan with a key signer on TxEmulator", () => {
  it("sends a payment signed by keySigner to final", async () => {
    const { emulator, builder } = await setup();
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

    const plan = builder.plan(pay(), { payer: address });
    await plan.send({ signers: keySigner(key), waitFor: "included" });
    expect(plan.status).toBe("final");
    expect(await signedBy(plan.signedTx!)).toEqual([keyHash]);
    const json = JSON.stringify(plan.toJSON());
    expect(json.includes(key)).toBe(false);

    // One list of signers serves every transaction: a key signer not asked for signs nothing
    const other = builder.plan(pay(), { payer: address });
    await other.send({
      signers: [keySigner(randomBytes(32).toString("hex")), keySigner(key)],
      waitFor: "included",
    });
    expect(other.status).toBe("final");
    expect(await signedBy(other.signedTx!)).toEqual([keyHash]);
  });
});

describe.each(["object", "callback"] as const)(
  "TxPlan with a signer of transaction hashes (%s) on TxEmulator",
  (form) => {
    beforeAll(() => Crypto.ready());

    it("signs in sign(), send() and advance()", async () => {
      const { emulator, builder } = await setup();
      const key = testKey();
      emulator.fund(key.address, { lovelace: 100_000_000n });

      const viaSign = builder.plan(pay(), { payer: key.address });
      const built = await viaSign.build();
      const signer = keysSigner(form, key);
      await viaSign.sign({ signers: signer.signer });
      expect(viaSign.status).toBe("signed");
      expect(await signedBy(viaSign.signedTx!)).toEqual([key.keyHash]);
      expect(signer.requests).toHaveLength(1);
      expect(signer.requests[0]!.txHash).toBe(built.txHash);
      expect(signer.requests[0]!.tx).toBe(built.tx);
      expect(signer.requests[0]!.keyHashes).toEqual([key.keyHash]);
      await viaSign.send({ waitFor: "included" });
      expect(viaSign.status).toBe("final");

      const viaSend = builder.plan(pay(), { payer: key.address });
      await viaSend.send({
        signers: keysSigner(form, key).signer,
        waitFor: "included",
      });
      expect(viaSend.status).toBe("final");

      const viaAdvance = builder.plan(pay(), { payer: key.address });
      await viaAdvance.advance({
        signers: [keysSigner(form, key).signer],
        waitFor: "included",
      });
      expect(viaAdvance.status).toBe("final");
    });

    it("hands each signer the keys not signed yet, skips a signer of hashes with none left, and passes the signal", async () => {
      const { builder, wallet } = await setup();
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
      const plan = builder.plan(
        [
          pay(),
          guard.pubKey({ keyHash: first.keyHash }),
          guard.pubKey({ keyHash: second.keyHash }),
        ],
        { payer: wallet },
      );
      await plan.build();
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
      expect(plan.status).toBe("signed");
      expect([...lists[0]!].sort()).toEqual(
        [payerKey, first.keyHash, second.keyHash].sort(),
      );
      expect(both.requests).toHaveLength(1);
      expect([...both.requests[0]!.keyHashes!].sort()).toEqual(
        [first.keyHash, second.keyHash].sort(),
      );
      expect(both.requests[0]!.signal).toBe(controller.signal);
      // Nothing left: the signer of hashes is not asked, a wallet still is, with an empty list
      expect(late.requests).toEqual([]);
      expect(lists).toHaveLength(2);
      expect(lists[1]).toEqual([]);
      expect(await signedBy(plan.signedTx!)).toEqual(
        [payerKey, first.keyHash, second.keyHash].sort(),
      );

      // A signer of hashes after a wallet is asked only for what the wallet left
      const after = builder.plan(
        [pay(), guard.pubKey({ keyHash: first.keyHash })],
        { payer: wallet },
      );
      await after.build();
      const cosigner = keysSigner(form, first);
      await after.sign({ signers: [wallet, cosigner.signer] });
      expect(cosigner.requests[0]!.keyHashes).toEqual([first.keyHash]);
      expect("signal" in cosigner.requests[0]!).toBe(false);
      expect(after.status).toBe("signed");
    });

    it("is SIGNER_FAILED for a signature that does not verify, SIGN_DECLINED for a decline, and changes nothing", async () => {
      const { builder, wallet } = await setup();
      const key = testKey();
      const plan = builder.plan(
        [pay(), guard.pubKey({ keyHash: key.keyHash })],
        { payer: wallet },
      );
      const built = await plan.build();
      const forged = hashSigner(form, () => [
        { vkey: key.vkey, signature: key.sign("cd".repeat(32)) },
      ]);
      const failed = (await caught(
        plan.sign({ signers: [wallet, forged.signer] }),
      )) as TxPlanError<"SIGNER_FAILED">;
      expectCode(failed, "SIGNER_FAILED");
      expect(failed.details.reason).toBe("error");
      expect(plan.status).toBe("built");
      // The wallet's signature, asked first, is kept
      expect(plan.missing.map((k) => k.keyHash)).toEqual([key.keyHash]);

      const declined = new TxPlanErrorClass("SIGN_DECLINED", "not today");
      const declining = hashSigner(form, () => Promise.reject(declined));
      const error = await caught(plan.send({ signers: declining.signer }));
      expectCode(error, "SIGN_DECLINED");
      expect(error).not.toBe(declined);
      expect((error as TxPlanError).cause).toBe(declined);
      expect(plan.status).toBe("built");
      expect(plan.txHash).toBe(built.txHash);
      expect(plan.attempts).toHaveLength(1);

      await plan.sign({ signers: keysSigner(form, key).signer });
      expect(plan.status).toBe("signed");
    });

    it("waits for a signer of hashes no longer than the attempt's deadline", async () => {
      const { builder, wallet } = await setup();
      const key = testKey();
      const plan = builder.plan(
        [pay(), guard.pubKey({ keyHash: key.keyHash })],
        { payer: wallet, ttlMs: 1_000 },
      );
      await plan.build();
      const silent = hashSigner(form, () => new Promise(() => undefined));
      const error = (await caught(
        plan.sign({ signers: silent.signer }),
      )) as TxPlanError<"SIGNER_FAILED">;
      expectCode(error, "SIGNER_FAILED");
      expect(error.details.reason).toBe("timeout");
      expect(silent.requests).toHaveLength(1);
      expect(plan.status).toBe("built");
    }, 10_000);

    it("does not hold a signer of hashes with no key left to the attempt's deadline", async () => {
      const { builder, wallet } = await setup();
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
      const signWith = async (
        plan: ReturnType<typeof builder.plan>,
        next: Signer,
      ): Promise<unknown> => {
        try {
          await plan.sign({ signers: [lateWallet, next] });
          return undefined;
        } catch (error) {
          return error;
        } finally {
          Date.now = realNow;
        }
      };

      const plan = builder.plan(pay(), { payer: wallet, ttlMs: 60_000 });
      await plan.build();
      const hashes = keysSigner(form, testKey());
      expect(await signWith(plan, hashes.signer)).toBeUndefined();
      expect(hashes.requests).toEqual([]);
      expect(plan.status).toBe("signed");

      // The deadline has passed: a wallet asked next is not waited for
      const other = builder.plan(pay(), { payer: wallet, ttlMs: 60_000 });
      await other.build();
      const timedOut = (await signWith(other, {
        signTxWitnesses: () => Promise.resolve("a0"),
      })) as TxPlanError<"SIGNER_FAILED">;
      expectCode(timedOut, "SIGNER_FAILED");
      expect(timedOut.details.reason).toBe("timeout");
    });
  },
);
