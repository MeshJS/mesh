import { randomBytes } from "node:crypto";
import { bech32 } from "bech32";

import { mnemonicToEntropy } from "@meshsdk/common";
import { deserializeAddress, NativeScript } from "@meshsdk/core";
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
} from "../../src/tx-builder";
import { cip30Wallet } from "../cip30-wallet";
import { baseAddress } from "../test-util";

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
