import { deserializeAddress } from "@meshsdk/core";

import type { TxIntentError } from "../../../src/tx-builder";
import {
  addWitnesses,
  guard,
  signWitnesses,
  spend,
  TxError,
  validity,
} from "../../../src/tx-builder";
import { recordOf } from "../../../src/tx-builder/intent/intent";
import {
  caught,
  pay,
  setup,
  submitterOf,
  walletOf,
} from "./intent-emulator-util";

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

describe("TxIntent signing on TxEmulator", () => {
  it("signs with the call's signers, else with a payer that can sign", async () => {
    const { builder, wallet, address } = await setup();
    // A payer given as an address cannot sign
    const byAddress = builder.intent(pay(), { payer: address });
    await byAddress.build();
    const error = (await caught(
      byAddress.sign(),
    )) as TxIntentError<"MISSING_SIGNATURES">;
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
    const viaSend = builder.intent(pay(), { payer: address });
    await viaSend.send({ signers: [wallet], waitFor: "included" });
    expect(viaSend.status).toBe("final");

    // The payer itself
    const viaPayer = builder.intent(pay(), { payer: wallet });
    await viaPayer.build();
    await viaPayer.sign();
    expect(viaPayer.status).toBe("signed");
    expect(await signedBy(viaPayer.signedTx!)).toEqual([await keyOf(wallet)]);
  });

  it("is MISSING_SIGNATURES with no signer at all, also when no key is missing", async () => {
    const { builder, wallet, address } = await setup();
    const byAddress = builder.intent(pay(), { payer: address });
    await byAddress.build();
    await byAddress.sign({ signers: wallet });
    expect(byAddress.status).toBe("signed");
    const error = (await caught(
      byAddress.sign(),
    )) as TxIntentError<"MISSING_SIGNATURES">;
    expectCode(error, "MISSING_SIGNATURES");
    expect(error.details.missing).toEqual([]);
    // An empty list of signers is no signer
    expectCode(
      await caught(byAddress.sign({ signers: [] })),
      "MISSING_SIGNATURES",
    );
    expect(byAddress.status).toBe("signed");

    // ... and the payer signs in its place
    const viaSign = builder.intent(pay(), { payer: wallet });
    await viaSign.build();
    await viaSign.sign({ signers: [] });
    expect(viaSign.status).toBe("signed");
    const viaSend = builder.intent(pay(), { payer: wallet });
    await viaSend.send({ signers: [], waitFor: "included" });
    expect(viaSend.status).toBe("final");
  });

  it("changes nothing when the signer declines", async () => {
    const { builder, wallet } = await setup();
    const intent = builder.intent(pay(), { payer: wallet });
    const built = await intent.build();
    const declining = {
      signTx: async () => {
        throw { code: 2, info: "declined" };
      },
    };
    expectCode(
      await caught(intent.sign({ signers: declining })),
      "SIGN_DECLINED",
    );
    expect(intent.status).toBe("built");
    expect(intent.txHash).toBe(built.txHash);
    expect(recordOf(intent).attempts[0]!.witnesses).toEqual([]);
    expectCode(
      await caught(intent.send({ signers: declining })),
      "SIGN_DECLINED",
    );
    expect(intent.status).toBe("built");
    expect(intent.attempts).toHaveLength(1);
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
    const intent = builder.intent(pay(), options);
    expectCode(await caught(intent.send({ submitter: refusing })), "REJECTED");
    expect(intent.status).toBe("rejected");
    // A signer adds a key the fee counted: the attempt is signed again
    await intent.sign({
      signers: { signTx: async (tx: string) => signWitnesses(outsider, tx) },
    });
    expect(intent.status).toBe("signed");
    expect(intent.attempts[0]!.sends).toBe(1);

    // Past its deadline, the attempt that was sent is EXPIRED, without unsent
    emulator.advanceTo({ time: intent.attempts[0]!.until + 1_000 });
    const counting = submitterOf((tx) => emulator.submitTx(tx));
    const error = (await caught(
      intent.send({ submitter: counting }),
    )) as TxIntentError<"EXPIRED">;
    expectCode(error, "EXPIRED");
    expect(error.details.unsent).toBeUndefined();
    expect(error.message).not.toContain("never sent");
    expect(counting.calls).toEqual([]);
    expect(intent.status).toBe("signed");

    // The same through addWitnesses
    const added = builder.intent(pay(), options);
    await caught(added.send({ submitter: refusing }));
    expect(added.status).toBe("rejected");
    await added.addWitnesses(await signWitnesses(outsider, added.built!.tx));
    expect(added.status).toBe("signed");
  });

  it("is MISSING_SIGNATURES before the ledger, and addWitnesses completes the attempt", async () => {
    const { builder, wallet, provider } = await setup();
    const cosigner = await walletOf(1);
    const cosignerKey = await keyOf(cosigner);
    const intent = builder.intent(
      [pay(), guard.pubKey({ keyHash: cosignerKey })],
      { payer: wallet },
    );
    const error = (await caught(
      intent.send(),
    )) as TxIntentError<"MISSING_SIGNATURES">;
    expectCode(error, "MISSING_SIGNATURES");
    expect(error.details.missing).toEqual([
      {
        keyHash: cosignerKey,
        neededBy: [{ part: "guard", role: "guard" }],
      },
    ]);
    expect(intent.missing.map((k) => k.keyHash)).toEqual([cosignerKey]);
    expect(intent.status).toBe("built");
    expect(intent.signedTx).toBeUndefined();
    expect(provider.control.count("submitTx")).toBe(0);

    await intent.addWitnesses(await signWitnesses(cosigner, intent.built!.tx));
    expect(intent.status).toBe("signed");
    await intent.send({ waitFor: "included" });
    expect(intent.status).toBe("final");
  });

  it("takes only the vkey witnesses of a full transaction, keeping body and hash", async () => {
    const { builder, wallet } = await setup();
    const fullTx = {
      signTx: async (tx: string) => wallet.signTx(tx, true, true),
    };
    const intent = builder.intent(pay(), { payer: wallet });
    const built = await intent.build();
    await intent.sign({ signers: fullTx });
    expect(intent.status).toBe("signed");
    expect(intent.txHash).toBe(built.txHash);
    expect(intent.built).toBe(built);
    expect(await signedBy(intent.signedTx!)).toEqual([await keyOf(wallet)]);
    // The signed transaction differs from the unsigned one only in its witness set
    expect(intent.signedTx!.length).toBeGreaterThan(built.tx.length);

    const other = builder.intent(pay(), { payer: wallet });
    const otherBuilt = await other.build();
    await other.addWitnesses(await wallet.signTx(otherBuilt.tx, true, true));
    expect(other.status).toBe("signed");
    expect(other.txHash).toBe(otherBuilt.txHash);
    await other.send({ waitFor: "included" });
    expect(other.status).toBe("final");
  });

  it("is INVALID_WITNESS for garbage, a foreign body and a replaced attempt", async () => {
    const { emulator, builder, wallet } = await setup();
    const intent = builder.intent(pay(), { payer: wallet });
    const first = await intent.build();
    const firstWitness = await signWitnesses(wallet, first.tx);
    // Replaced: refused at its delivery, then built anew
    await caught(
      intent.send({
        submitter: submitterOf(async () => {
          throw { kind: "rejected" };
        }),
      }),
    );
    emulator.advanceTo({ slot: emulator.slot + 1 });
    const second = await intent.build();
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
        intent.addWitnesses(witness),
      )) as TxIntentError<"INVALID_WITNESS">;
      expectCode(error, "INVALID_WITNESS");
      expect(error.details.reason).toBe(reason);
      expect(error.details.argument).toBe(argument);
    }
    // The index of the argument that holds it
    const second2 = (await caught(
      intent.addWitnesses(
        await signWitnesses(await walletOf(1), second.tx),
        firstWitness,
      ),
    )) as TxIntentError<"INVALID_WITNESS">;
    expect(second2.details).toMatchObject({
      reason: "staleAttempt",
      argument: 1,
      keyHash: await keyOf(wallet),
    });
    expect(intent.status).toBe("built");
  });

  it("is EXPIRED (unsent) for a signature that came after the deadline", async () => {
    const { emulator, builder, wallet } = await setup();
    const counting = submitterOf((tx) => emulator.submitTx(tx));
    const late = {
      signTx: async (tx: string) => {
        emulator.advanceTo({ time: intent.attempts[0]!.until + 1_000 });
        return wallet.signTx(tx, true);
      },
    };
    // A margin keeps the attempt signed past its deadline: the body may have left
    const intent = builder.intent(pay(), {
      payer: wallet,
      expiryMarginMs: 600_000,
    });
    const error = (await caught(
      intent.send({ signers: late, submitter: counting }),
    )) as TxIntentError<"EXPIRED">;
    expectCode(error, "EXPIRED");
    expect(error.details.unsent).toBe(true);
    expect(error.details.otherLive).toEqual([]);
    expect(counting.calls).toEqual([]);
    expect(intent.status).toBe("signed");
    // The same, seen right after the observation: nothing is signed
    const again = (await caught(
      intent.send({ submitter: counting }),
    )) as TxIntentError<"EXPIRED">;
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
    const intent = builder.intent(pay(), { payer: wallet, ttlMs: 1_000 });
    const built = await intent.build();
    const started = Date.now();
    const error = (await caught(
      intent.sign({ signers: silent }),
    )) as TxIntentError<"SIGNER_FAILED">;
    const waited = Date.now() - started;
    expectCode(error, "SIGNER_FAILED");
    expect(error.details.reason).toBe("timeout");
    expect(waited).toBeGreaterThanOrEqual(900);
    expect(waited).toBeLessThan(3_000);
    expect(intent.status).toBe("built");
    expect(intent.txHash).toBe(built.txHash);
    expect(asked).toBe(1);

    // An aborted signal ends the wait sooner
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    const aborted = await caught(
      intent.sign({ signers: silent, signal: controller.signal }),
    );
    expectCode(aborted, "ABORTED");

    // Without a tip there is no limit but the signal
    tipFails = true;
    const unbounded = new AbortController();
    setTimeout(() => unbounded.abort(), 1_500);
    const start = Date.now();
    expectCode(
      await caught(intent.sign({ signers: silent, signal: unbounded.signal })),
      "ABORTED",
    );
    expect(Date.now() - start).toBeGreaterThanOrEqual(1_400);
    tipFails = false;

    // Past the deadline the signer is not asked
    emulator.advanceTo({ time: intent.attempts[0]!.until });
    const before = asked;
    const past = (await caught(
      intent.sign({ signers: silent }),
    )) as TxIntentError<"SIGNER_FAILED">;
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
    const intent = builder.intent([pay(), validity({ until })], {
      payer: wallet,
    });
    await intent.build();
    expect(intent.attempts[0]!.until).toBe(until);
    await intent.sign({ signers: slow });
    expect(intent.status).toBe("signed");
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

    const plain = builder.intent(pay(), { payer: wallet });
    await plain.build();
    await plain.sign({ signers: generous(outsider) });
    expect(await signedBy(plain.signedTx!)).toEqual([payerKey]);
    await plain.send({ waitFor: "included" });
    expect(plain.status).toBe("final");

    // The same through addWitnesses
    const added = builder.intent(pay(), { payer: wallet });
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
    const native = builder.intent(
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
    const extra = builder.intent(pay(), {
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
