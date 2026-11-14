import { randomBytes } from "node:crypto";
import { bech32 } from "bech32";

import { mnemonicToEntropy } from "@meshsdk/common";
import { deserializeAddress, mConStr0, NativeScript } from "@meshsdk/core";
import { Crypto, HexBlob } from "@meshsdk/core-cst";
import { TxEmulator, TxResult } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import {
  addWitnesses,
  certificate,
  keySigner,
  output,
  signedKeyHashes,
  Signer,
  signWitnesses,
  spend,
  StandaloneTx,
  TxBuilder,
  TxHashRequest,
  TxHashSigner,
  TxPlanError,
} from "../../src/tx-builder";
import { cip30Wallet } from "../cip30-wallet";
import { alwaysSucceedCbor, baseAddress } from "../test-util";
import { caught, Hooks, submitterOf, wrap } from "./plan/plan-emulator-util";

const words = Array(24).fill("solution");
const HARDENED = 0x80000000;
const recipient = baseAddress(2);

const walletOf = async (accountType: "payment" | "stake" = "payment") => {
  const wallet = new MeshWallet({
    networkId: 0,
    key: { type: "mnemonic", words },
    accountType,
  });
  await wallet.init();
  return wallet;
};

/** An emulator of preprod at a fixed slot, and a builder on it */
const setup = async (validator: "scalus" | "cquisitor") => {
  const emulator = await TxEmulator.create({
    validator,
    network: "preprod",
    slot: 100_000_000,
  });
  const builder = new TxBuilder({
    network: "preprod",
    provider: emulator,
    evaluator: emulator,
  });
  return { emulator, builder };
};

const rules = (result: TxResult) =>
  result.accepted ? [] : result.errors.map((e) => e.rule);
/** The ledger rule a missing signature breaks, under each validator */
const missingKeyRule = {
  scalus: "MissingKeyHashes",
  cquisitor: "MissingVKeyWitnesses",
} as const;

/** The payment and stake keys of the tests' seed, derived as a wallet derives them */
const seedKeys = async () => {
  await Crypto.ready();
  const account = Crypto.Bip32PrivateKey.fromBip39Entropy(
    Buffer.from(mnemonicToEntropy(words.join(" ")), "hex"),
    "",
  ).derive([HARDENED + 1852, HARDENED + 1815, HARDENED]);
  const payment = account.derive([0, 0]);
  const stake = account.derive([2, 0]);
  const asText = (prefix: string, key: Crypto.Bip32PrivateKey) =>
    bech32.encode(prefix, bech32.toWords(Buffer.from(key.hex(), "hex")), 1023);
  return {
    /** Signers over each key, made by keySigner */
    payment: keySigner(asText("addr_xsk", payment)),
    stake: keySigner(asText("stake_xsk", stake)),
    /** The application's own signer of hashes over both keys */
    own: ((): TxHashSigner => {
      const raw = [payment.toRawKey(), stake.toRawKey()];
      return {
        signTxHash: async ({ txHash, keys }: TxHashRequest) =>
          raw
            .filter((key) =>
              (keys ?? []).some(
                ({ keyHash }) => keyHash === key.toPublic().hash().hex(),
              ),
            )
            .map((key) => ({
              vkey: key.toPublic().hex() as string,
              signature: key.sign(HexBlob(txHash)).hex() as string,
            })),
      };
    })(),
  };
};

/** A stake registration of the seed's wallet: its payment and its stake key must sign */
const registration = async (validator: "scalus" | "cquisitor") => {
  const { emulator, builder } = await setup(validator);
  const wallet = await walletOf();
  const address = (await wallet.getChangeAddress())!;
  const rewardAddress = (await wallet.getRewardAddresses())[0]!;
  const { pubKeyHash, stakeCredentialHash } = deserializeAddress(address);
  emulator.fund(address, { lovelace: 100_000_000n });
  const build = () =>
    builder.build([certificate.stakeRegistration({ stake: rewardAddress })], {
      payer: address,
    });
  const built = await build();
  expect(built.missing.map((k) => k.keyHash).sort()).toEqual(
    [pubKeyHash, stakeCredentialHash].sort(),
  );
  return {
    emulator,
    builder,
    wallet,
    address,
    built,
    build,
    pubKeyHash,
    stakeCredentialHash,
  };
};

describe.each(["scalus", "cquisitor"] as const)(
  "StandaloneTx on TxEmulator (%s)",
  (validator) => {
    it("signs with each form of signer alone, and with all of them together", async () => {
      const { emulator, wallet, build, pubKeyHash, stakeCredentialHash } =
        await registration(validator);
      const api = await cip30Wallet({ words, fetcher: emulator });
      const keys = await seedKeys();
      const forms: [string, Signer | Signer[]][] = [
        ["a MeshWallet", wallet],
        ["a CIP-30 api", api],
        ["key signers", [keys.payment, keys.stake]],
        ["an object of its own", keys.own],
        [
          "a callback",
          (request: TxHashRequest) => keys.own.signTxHash(request),
        ],
        ["all together", [keys.stake, wallet, api, keys.own, keys.payment]],
      ];
      for (const [name, signers] of forms) {
        const built = await build();
        expect(built).toBeInstanceOf(StandaloneTx);
        expect(await built.sign({ signers, partial: false })).toBe(built);
        expect([name, built.missing]).toEqual([name, []]);
        expect((await signedKeyHashes(built.signedTx!)).sort()).toEqual(
          [pubKeyHash, stakeCredentialHash].sort(),
        );
        expect([name, await emulator.fork().submitTx(built.signedTx!)]).toEqual(
          [name, built.txHash],
        );
      }
    });

    it("drops an extra witness that the free functions keep and the fee does not cover", async () => {
      const { emulator, built } = await registration(validator);
      const keys = await seedKeys();
      const extra = keySigner(randomBytes(32).toString("hex"));
      // One signer that also signs with a key nobody asked for
      const greedy = async (request: TxHashRequest) => [
        ...(await keys.own.signTxHash(request)),
        ...(await extra.signTxHash({ ...request, keys: undefined })),
      ];
      const byFunctions = await addWitnesses(
        built.tx,
        await signWitnesses(greedy, built.tx, built.signers.keyHashes),
      );
      expect(await signedKeyHashes(byFunctions)).toHaveLength(3);
      const refused = await emulator.simulate(byFunctions);
      expect(refused.accepted).toBe(false);
      expect(rules(refused)).not.toContain(missingKeyRule[validator]);

      await built.sign({ signers: greedy });
      expect(await signedKeyHashes(built.signedTx!)).toHaveLength(2);
      expect(await emulator.submitTx(built.signedTx!)).toBe(built.txHash);
    });

    it("keeps a witness the build's extraKeyWitnesses paid for, and the ledger accepts it", async () => {
      const { emulator, builder, wallet, address } =
        await registration(validator);
      const keys = await seedKeys();
      const coSigner = keySigner(randomBytes(32).toString("hex"));
      const another = keySigner(randomBytes(32).toString("hex"));
      const built = await builder.build(
        [
          certificate.stakeRegistration({
            stake: (await wallet.getRewardAddresses())[0]!,
          }),
        ],
        { payer: address, extraKeyWitnesses: 1 },
      );
      // Two keys nobody asked for: the fee counts one of them
      const generous = async (request: TxHashRequest) => [
        ...(await keys.own.signTxHash(request)),
        ...(await coSigner.signTxHash({ ...request, keys: undefined })),
        ...(await another.signTxHash({ ...request, keys: undefined })),
      ];
      await built.sign({ signers: generous, partial: false });
      expect(await signedKeyHashes(built.signedTx!)).toHaveLength(3);
      expect(await emulator.submitTx(built.signedTx!)).toBe(built.txHash);
    });

    it("asks a key signer for a key a native script names, with its role", async () => {
      const { emulator, builder } = await setup(validator);
      await Crypto.ready();
      const wallet = await walletOf();
      const address = (await wallet.getChangeAddress())!;
      const scriptKey = randomBytes(32).toString("hex");
      const scriptKeyHash = Crypto.Ed25519PrivateKey.fromNormalBytes(
        Buffer.from(scriptKey, "hex"),
      )
        .toPublic()
        .hash()
        .hex() as string;
      const native: NativeScript = {
        type: "all",
        scripts: [{ type: "sig", keyHash: scriptKeyHash }],
      };
      const scriptAddress = builder.scriptAddress(native);
      emulator.fund(address, { lovelace: 100_000_000n });
      emulator.fund(scriptAddress, { lovelace: 20_000_000n });
      const built = await builder.build(
        [
          spend.native({
            utxo: emulator.utxos({ address: scriptAddress })[0]!,
            script: native,
          }),
          output({ address: recipient, value: { lovelace: 25_000_000n } }),
        ],
        { payer: address },
      );
      const requests: TxHashRequest[] = [];
      const signer = keySigner(scriptKey);
      await built.sign({
        signers: [
          wallet,
          (request: TxHashRequest) => {
            requests.push(request);
            return signer.signTxHash(request);
          },
        ],
      });
      expect(requests.map((r) => r.keys)).toEqual([
        [{ keyHash: scriptKeyHash, roles: ["nativeScript"] }],
      ]);
      expect(built.missing).toEqual([]);
      expect((await signedKeyHashes(built.signedTx!)).sort()).toEqual(
        [deserializeAddress(address).pubKeyHash, scriptKeyHash].sort(),
      );
      expect(await emulator.submitTx(built.signedTx!)).toBe(built.txHash);
    });

    it("signs what finalize returns", async () => {
      const { emulator, builder, built, address } =
        await registration(validator);
      const final = await builder.finalize(structuredClone(built.prototype), {
        inputs: built.inputs,
        changeAddress: address,
      });
      expect(final).toBeInstanceOf(StandaloneTx);
      const keys = await seedKeys();
      await final.sign({ signers: [keys.payment, keys.stake] });
      expect(await emulator.submitTx(final.signedTx!)).toBe(final.txHash);
    });

    it.each(["MeshWallet", "CIP-30 api"] as const)(
      "hands the partly signed transaction to a %s in another program, and takes back its answer",
      async (kind) => {
        const { emulator, built, stakeCredentialHash } =
          await registration(validator);
        const keys = await seedKeys();
        expect(built.partialTx).toBe(built.tx);
        await built.sign({ signers: keys.stake });
        expect(built.signedTx).toBeUndefined();
        expect(await signedKeyHashes(built.partialTx)).toEqual([
          stakeCredentialHash,
        ]);
        const refused = await emulator.simulate(built.partialTx);
        expect(rules(refused)).toContain(missingKeyRule[validator]);

        // The other program: it is given the bytes and answers as a wallet answers
        const theirs =
          kind === "MeshWallet"
            ? await (await walletOf()).signTx(built.partialTx, true)
            : await (
                await cip30Wallet({ words, fetcher: emulator })
              ).signTx(built.partialTx, true);
        await built.addWitnesses(theirs);
        expect(built.missing).toEqual([]);
        expect(built.partialTx).toBe(built.signedTx);
        expect(await emulator.submitTx(built.signedTx!)).toBe(built.txHash);
      },
    );
  },
);

/** The emulator of `setup`, behind a provider whose hooks change what it answers */
const wrapped = async (
  validator: "scalus" | "cquisitor",
  hooks: Hooks = {},
) => {
  const { emulator } = await setup(validator);
  const provider = wrap(emulator, hooks);
  const builder = new TxBuilder({
    network: "preprod",
    provider,
    evaluator: emulator,
  });
  const wallet = await walletOf();
  const address = (await wallet.getChangeAddress())!;
  emulator.fund(address, { lovelace: 100_000_000n });
  return { emulator, provider, builder, wallet, address };
};

const QUICK = { timeoutMs: 2_000, pollMs: 10 } as const;

describe.each(["scalus", "cquisitor"] as const)(
  "StandaloneTx submitted on TxEmulator (%s)",
  (validator) => {
    it("is built, signed, submitted and found in a block", async () => {
      const { emulator, builder, wallet, address } = await wrapped(validator);
      const built = await builder.build(
        output({ address: recipient, value: { lovelace: 5_000_000n } }),
        { payer: address },
      );
      await built.sign({ signers: wallet });
      expect(await built.submit()).toBe(built);
      const found = await built.awaitInclusion(QUICK);
      const info = await emulator.fetchTxInfo(built.txHash);
      expect(found).toEqual({
        txHash: built.txHash,
        slot: Number(info.slot),
        block: info.block,
        blockHeight: info.blockHeight,
      });
      expect(emulator.utxos({ address: recipient })).toHaveLength(1);
    });

    it("sends the same bytes when submitted twice, and the second refusal is no error", async () => {
      const { emulator, builder, wallet, address } = await wrapped(validator);
      const built = await builder.build(
        output({ address: recipient, value: { lovelace: 5_000_000n } }),
        { payer: address },
      );
      await built.sign({ signers: wallet });
      const recording = submitterOf((tx) => emulator.submitTx(tx));
      await built.submit({ submitter: recording });
      // The ledger refuses the repeat: its inputs are spent, by this very transaction
      expect(await built.submit({ submitter: recording })).toBe(built);
      expect(recording.calls).toEqual([built.signedTx, built.signedTx]);
      expect((await built.awaitInclusion(QUICK)).txHash).toBe(built.txHash);
    });

    it("is REJECTED for an input another transaction spent", async () => {
      const { builder, wallet, address } = await wrapped(validator);
      const pay = (lovelace: bigint) =>
        builder.build(output({ address: recipient, value: { lovelace } }), {
          payer: address,
        });
      // Both select the payer's one UTxO
      const first = await pay(5_000_000n);
      const second = await pay(6_000_000n);
      expect(second.inputs.map(({ txHash }) => txHash)).toEqual(
        first.inputs.map(({ txHash }) => txHash),
      );
      await first.sign({ signers: wallet });
      await second.sign({ signers: wallet });
      await first.submit();
      const error = await caught(second.submit());
      expect(error).toBeInstanceOf(TxPlanError);
      expect([error.code, error.retryable, error.details]).toEqual([
        "REJECTED",
        false,
        { otherLive: [] },
      ]);
      expect(error.cause).toMatchObject({ kind: "rejected" });
      expect(
        (await caught(second.awaitInclusion({ timeoutMs: 50, pollMs: 10 })))
          .code,
      ).toBe("CONFIRM_TIMEOUT");
      expect((await first.awaitInclusion(QUICK)).txHash).toBe(first.txHash);
    });

    it("is SUBMIT_FAILED when the answer is lost; the same call then returns, and the transaction is found", async () => {
      const { emulator, builder, wallet, address } = await wrapped(validator);
      const built = await builder.build(
        output({ address: recipient, value: { lovelace: 5_000_000n } }),
        { payer: address },
      );
      await built.sign({ signers: wallet });
      const lossy = submitterOf(async (tx) => {
        await emulator.submitTx(tx);
        throw new Error("socket hang up");
      });
      const lost = await caught(built.submit({ submitter: lossy }));
      expect([lost.code, lost.retryable]).toEqual(["SUBMIT_FAILED", true]);
      expect(await built.submit()).toBe(built);
      expect((await built.awaitInclusion(QUICK)).txHash).toBe(built.txHash);
    });

    describe("a Plutus spend", () => {
      const script = { code: alwaysSucceedCbor, version: "V3" as const };

      /** A script output locked by the wallet, and its spend, signed */
      const unlocking = async (hooks: Hooks = {}) => {
        const setUp = await wrapped(validator, hooks);
        const { builder, wallet, address } = setUp;
        const scriptAddress = builder.scriptAddress(script);
        const lock = await builder.build(
          output({
            address: scriptAddress,
            value: { lovelace: 20_000_000n },
            datum: { type: "inline", data: mConStr0([]) },
          }),
          { payer: address },
        );
        await (await lock.sign({ signers: wallet })).submit();
        const utxo = setUp.emulator.utxos({ address: scriptAddress })[0]!;
        const unlock = await builder.build(
          [
            spend.plutus({ utxo, script, redeemer: { data: mConStr0([]) } }),
            output({ address: recipient, value: { lovelace: 15_000_000n } }),
          ],
          { payer: address },
        );
        expect(unlock.redeemers).toHaveLength(1);
        await unlock.sign({ signers: wallet });
        await unlock.submit();
        return { ...setUp, lock, unlock };
      };

      it("is found with the validity the provider gives", async () => {
        const { emulator, unlock } = await unlocking();
        expect((await emulator.fetchTxInfo(unlock.txHash)).validContract).toBe(
          true,
        );
        expect((await unlock.awaitInclusion(QUICK)).txHash).toBe(unlock.txHash);
      });

      it("is CANNOT_OBSERVE (noValidity) when the provider does not say whether its scripts passed; a payment needs no validity", async () => {
        const { lock, unlock } = await unlocking({
          fetchTxInfo: async (forward, hash) => {
            const { validContract: _valid, ...info } = await forward(hash);
            return info;
          },
        });
        const error = await caught(unlock.awaitInclusion(QUICK));
        expect([error.code, error.details]).toEqual([
          "CANNOT_OBSERVE",
          { reason: "noValidity" },
        ]);
        expect((await lock.awaitInclusion(QUICK)).txHash).toBe(lock.txHash);
      });

      it("is SCRIPT_FAILED when it is found with is_valid = false", async () => {
        const { unlock } = await unlocking({
          fetchTxInfo: async (forward, hash) => ({
            ...(await forward(hash)),
            validContract: false,
          }),
        });
        expect((await caught(unlock.awaitInclusion(QUICK))).code).toBe(
          "SCRIPT_FAILED",
        );
      });
    });

    it("is signed in part by one builder, restored from JSON by another, which signs the rest, submits it and finds it", async () => {
      const { emulator, built, pubKeyHash, stakeCredentialHash } =
        await registration(validator);
      const keys = await seedKeys();
      await built.sign({ signers: keys.payment });
      expect(built.missing.map((k) => k.keyHash)).toEqual([
        stakeCredentialHash,
      ]);
      const text = JSON.stringify(built);

      // Another process: a builder of its own on the same chain
      const other = new TxBuilder({
        network: "preprod",
        provider: emulator,
        evaluator: emulator,
      });
      const restored = await other.restore(JSON.parse(text));
      expect(restored).toBeInstanceOf(StandaloneTx);
      expect({ ...restored }).toEqual({ ...built });
      expect(restored.partialTx).toBe(built.partialTx);
      // What is held is not enough for the ledger
      const early = await emulator.simulate(restored.partialTx);
      expect(rules(early)).toContain(missingKeyRule[validator]);

      await restored.sign({ signers: keys.stake, partial: false });
      expect((await signedKeyHashes(restored.signedTx!)).sort()).toEqual(
        [pubKeyHash, stakeCredentialHash].sort(),
      );
      expect(await restored.submit()).toBe(restored);
      expect((await restored.awaitInclusion(QUICK)).txHash).toBe(built.txHash);
      // The original finds it too, and a JSON written after the delivery carries its mark
      expect((await built.awaitInclusion(QUICK)).txHash).toBe(built.txHash);
      expect(restored.toJSON().delivered).toBe(true);
    });

    it("builds after an unsent transaction, and both are submitted in order and found", async () => {
      const { emulator, builder, wallet, address } = await wrapped(validator);
      const first = await builder.build(
        output({ address: recipient, value: { lovelace: 5_000_000n } }),
        { payer: address },
      );
      const second = await builder.build(
        output({ address: recipient, value: { lovelace: 6_000_000n } }),
        { payer: address, after: first },
      );
      expect(second.inputs.map(({ txHash }) => txHash)).toContain(first.txHash);
      for (const built of [first, second])
        await built.sign({ signers: wallet, partial: false });
      await first.submit();
      await second.submit();
      for (const built of [first, second])
        expect((await built.awaitInclusion(QUICK)).txHash).toBe(built.txHash);
      expect(emulator.utxos({ address: recipient })).toHaveLength(2);
    });
  },
);
