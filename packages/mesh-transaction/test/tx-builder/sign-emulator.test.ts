import { randomBytes } from "node:crypto";
import { bech32 } from "bech32";

import { mnemonicToEntropy } from "@meshsdk/common";
import {
  addWitnesses as addWitnessesOfCore,
  deserializeAddress,
  mConStr0,
  NativeScript,
  signWitnesses as signWitnessesOfCore,
  UTxO,
} from "@meshsdk/core";
import { Crypto } from "@meshsdk/core-cst";
import { TxEmulator, TxResult } from "@meshsdk/tx-emulator";
import { AppWallet, MeshWallet } from "@meshsdk/wallet";

import {
  addWitnesses,
  BuiltTxData,
  certificate,
  guard,
  keySigner,
  output,
  requiredSigners,
  signedKeyHashes,
  signWitnesses,
  spend,
  TxBuilder,
  TxSigners,
  validity,
} from "../../src/tx-builder";
import { cip30Wallet } from "../cip30-wallet";
import { alwaysSucceedCbor, baseAddress, vestingCbor } from "../test-util";
import { keysSigner, testKey } from "./hash-signer-util";

const words = Array(24).fill("solution");
const HARDENED = 0x80000000;
const recipient = baseAddress(2);
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };

const walletOf = async (
  accountType: "payment" | "stake" = "payment",
  accountIndex = 0,
) => {
  const wallet = new MeshWallet({
    networkId: 0,
    key: { type: "mnemonic", words },
    accountType,
    accountIndex,
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

/** `TxSigners` with every list but the roles of a key sorted, to compare two of them */
const normalized = (signers: TxSigners) => {
  const json = (v: unknown) => JSON.stringify(v);
  return {
    keyHashes: [...signers.keyHashes].sort(),
    keys: signers.keys
      .map((k) => ({ keyHash: k.keyHash, roles: k.roles }))
      .sort((a, b) => a.keyHash.localeCompare(b.keyHash)),
    byronAddresses: [...signers.byronAddresses].sort(),
    nativeScripts: [...signers.nativeScripts].sort((a, b) =>
      json(a).localeCompare(json(b)),
    ),
  };
};
/** `requiredSigners` of the serialized transaction agrees with what the build reports */
const expectAgrees = (built: BuiltTxData) =>
  expect(
    normalized(
      requiredSigners(built.tx, [
        ...built.inputs,
        ...(built.collateral?.inputs ?? []),
      ]),
    ),
  ).toEqual(normalized(built.signers));

describe.each(["scalus", "cquisitor"] as const)(
  "signing functions on TxEmulator (%s)",
  (validator) => {
    it("signs a payment with a Mesh wallet, a CIP-30 api and a signer answering with a full transaction", async () => {
      const { emulator, builder } = await setup(validator);
      const wallet = await walletOf();
      const address = (await wallet.getChangeAddress())!;
      emulator.fund(address, { lovelace: 100_000_000n });
      const built = await builder.build(
        [output({ address: recipient, value: { lovelace: 5_000_000n } })],
        { payer: address },
      );
      expectAgrees(built);

      const api = await cip30Wallet({ words, fetcher: emulator });
      const app = new AppWallet({
        networkId: 0,
        key: { type: "mnemonic", words },
      });
      await app.init();
      const fullTx = { signTx: (tx: string) => wallet.signTx(tx, true) };
      for (const signer of [wallet, api, app, fullTx]) {
        const witnesses = await signWitnessesOfCore(signer, built.tx);
        const signed = await addWitnessesOfCore(built.tx, witnesses);
        expect(await emulator.fork().submitTx(signed)).toBe(built.txHash);
      }
    });

    it("signs a Plutus spend without touching what the script data hash covers", async () => {
      const { emulator, builder } = await setup(validator);
      const wallet = await walletOf();
      const address = (await wallet.getChangeAddress())!;
      emulator.fund(address, { lovelace: 100_000_000n });
      const datum = mConStr0([42]);
      const scriptAddress = builder.scriptAddress(plutusScript);
      const lock = await builder.build(
        [
          output({
            address: scriptAddress,
            value: { lovelace: 10_000_000n },
            datum: { type: "hash", data: datum },
          }),
        ],
        { payer: address },
      );
      expectAgrees(lock);
      expect(
        await emulator.submitTx(
          await addWitnesses(lock.tx, await signWitnesses(wallet, lock.tx)),
        ),
      ).toBe(lock.txHash);

      const built = await builder.build(
        [
          spend.plutus({
            utxo: emulator.utxos({ address: scriptAddress })[0]!,
            script: plutusScript,
            redeemer: { data: mConStr0([]) },
            datum: { data: datum },
          }),
        ],
        { payer: address },
      );
      const { witness_set } = built.prototype;
      expect(witness_set.plutus_data?.elems).toHaveLength(1);
      expect(witness_set.redeemers).toHaveLength(1);
      expect(witness_set.plutus_v3_scripts).toHaveLength(1);
      expect(built.collateral?.inputs.length).toBeGreaterThan(0);
      expectAgrees(built);

      const fromSet = await addWitnesses(
        built.tx,
        await signWitnesses(wallet, built.tx),
      );
      expect(await emulator.fork().submitTx(fromSet)).toBe(built.txHash);
      const fromFullTx = await addWitnesses(
        built.tx,
        await wallet.signTx(built.tx, true),
      );
      expect(fromFullTx).toBe(fromSet);
      expect(await emulator.submitTx(fromFullTx)).toBe(built.txHash);
    });

    it("needs the witnesses of both keys of a seed for a stake registration", async () => {
      const { emulator, builder } = await setup(validator);
      const payment = await walletOf("payment");
      const stake = await walletOf("stake");
      const address = (await payment.getChangeAddress())!;
      const rewardAddress = (await payment.getRewardAddresses())[0]!;
      const { pubKeyHash, stakeCredentialHash } = deserializeAddress(address);
      emulator.fund(address, { lovelace: 100_000_000n });
      const built = await builder.build(
        [certificate.stakeRegistration({ stake: rewardAddress })],
        { payer: address },
      );
      expect([...built.signers.keyHashes].sort()).toEqual(
        [pubKeyHash, stakeCredentialHash].sort(),
      );
      expectAgrees(built);

      const paymentOnly = await addWitnesses(
        built.tx,
        await signWitnesses(payment, built.tx),
      );
      expect(await signedKeyHashes(paymentOnly)).toEqual([pubKeyHash]);
      const refused = await emulator.simulate(paymentOnly);
      expect(refused.accepted).toBe(false);
      expect(rules(refused)).toContain(missingKeyRule[validator]);

      const both = await addWitnesses(
        built.tx,
        await signWitnesses(payment, built.tx),
        await signWitnesses(stake, built.tx),
      );
      expect(await emulator.fork().submitTx(both)).toBe(built.txHash);

      // A wallet that signs with every listed key of its seed, asked with the list
      const listed = await signWitnesses(
        payment,
        built.tx,
        built.signers.keyHashes,
      );
      const signed = await addWitnesses(built.tx, listed);
      expect((await signedKeyHashes(signed)).sort()).toEqual(
        [pubKeyHash, stakeCredentialHash].sort(),
      );
      expect(await emulator.submitTx(signed)).toBe(built.txHash);
    });

    it("spends from a 2-of-2 native script, its witnesses added in two calls", async () => {
      const { emulator, builder } = await setup(validator);
      const payment = await walletOf("payment");
      const stake = await walletOf("stake");
      const address = (await payment.getChangeAddress())!;
      const { pubKeyHash, stakeCredentialHash } = deserializeAddress(address);
      const native: NativeScript = {
        type: "all",
        scripts: [
          { type: "sig", keyHash: pubKeyHash },
          { type: "sig", keyHash: stakeCredentialHash },
        ],
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
          guard.pubKey({ keyHash: pubKeyHash }),
          guard.pubKey({ keyHash: stakeCredentialHash }),
          output({ address: recipient, value: { lovelace: 15_000_000n } }),
        ],
        { payer: address },
      );
      const signers = requiredSigners(built.tx, [
        ...built.inputs,
        ...(built.collateral?.inputs ?? []),
      ]);
      expect(signers.nativeScripts).toHaveLength(1);
      expect([...signers.keyHashes].sort()).toEqual(
        [pubKeyHash, stakeCredentialHash].sort(),
      );
      expectAgrees(built);

      const first = await addWitnesses(
        built.tx,
        await signWitnesses(payment, built.tx),
      );
      const second = await addWitnesses(
        first,
        await signWitnesses(stake, built.tx),
      );
      expect(await emulator.submitTx(second)).toBe(built.txHash);
    });

    it("signs with key signers over a normal key and over an extended key", async () => {
      const { emulator, builder } = await setup(validator);
      await Crypto.ready();
      // The wallet's payment key, extended, given as addr_xsk with its chain code
      const wallet = await walletOf();
      const address = (await wallet.getChangeAddress())!;
      const payment = Crypto.Bip32PrivateKey.fromBip39Entropy(
        Buffer.from(mnemonicToEntropy(words.join(" ")), "hex"),
        "",
      ).derive([HARDENED + 1852, HARDENED + 1815, HARDENED, 0, 0]);
      const extended = keySigner(
        bech32.encode(
          "addr_xsk",
          bech32.toWords(Buffer.from(payment.hex(), "hex")),
          1023,
        ),
      );
      // A key made here, in hex, required by a guard
      const normalKey = randomBytes(32).toString("hex");
      const normalHash = Crypto.Ed25519PrivateKey.fromNormalBytes(
        Buffer.from(normalKey, "hex"),
      )
        .toPublic()
        .hash()
        .hex() as string;
      const normal = keySigner(normalKey);
      emulator.fund(address, { lovelace: 100_000_000n });
      const built = await builder.build(
        [
          output({ address: recipient, value: { lovelace: 5_000_000n } }),
          guard.pubKey({ keyHash: normalHash }),
        ],
        { payer: address },
      );
      const { pubKeyHash } = deserializeAddress(address);
      const { keyHashes } = built.signers;

      // Each signs its own key only
      const byExtended = await addWitnesses(
        built.tx,
        await signWitnesses(extended, built.tx, keyHashes),
      );
      expect(await signedKeyHashes(byExtended)).toEqual([pubKeyHash]);
      const refused = await emulator.simulate(byExtended);
      expect(rules(refused)).toContain(missingKeyRule[validator]);

      const signed = await addWitnesses(
        byExtended,
        await signWitnesses(normal, built.tx, keyHashes),
      );
      expect((await signedKeyHashes(signed)).sort()).toEqual(
        [pubKeyHash, normalHash].sort(),
      );
      // The same witness the wallet makes for its key
      expect(
        await addWitnesses(
          built.tx,
          await wallet.signTxWitnesses(built.tx, [pubKeyHash]),
        ),
      ).toBe(byExtended);
      expect(await emulator.submitTx(signed)).toBe(built.txHash);
    });

    it.each(["object", "callback"] as const)(
      "signs a payment and a key the transaction requires with a signer of hashes (%s)",
      async (form) => {
        const { emulator, builder } = await setup(validator);
        await Crypto.ready();
        const payer = testKey();
        const cosigner = testKey();
        emulator.fund(payer.address, { lovelace: 100_000_000n });
        const built = await builder.build(
          [
            output({ address: recipient, value: { lovelace: 5_000_000n } }),
            guard.pubKey({ keyHash: cosigner.keyHash }),
          ],
          { payer: payer.address },
        );
        expectAgrees(built);
        expect([...built.signers.keyHashes].sort()).toEqual(
          [payer.keyHash, cosigner.keyHash].sort(),
        );

        // Without the signatures the ledger refuses it
        const unsigned = await emulator.simulate(built.tx);
        expect(unsigned.accepted).toBe(false);
        expect(rules(unsigned)).toContain(missingKeyRule[validator]);

        const signer = keysSigner(form, payer, cosigner);
        const witnesses = await signWitnesses(
          signer.signer,
          built.tx,
          built.signers.keyHashes,
        );
        expect(signer.requests[0]!.txHash).toBe(built.txHash);
        const signed = await addWitnesses(built.tx, witnesses);
        expect((await signedKeyHashes(signed)).sort()).toEqual(
          [payer.keyHash, cosigner.keyHash].sort(),
        );
        expect(await emulator.submitTx(signed)).toBe(built.txHash);
      },
    );
  },
);

describe("signing functions on TxEmulator", () => {
  it("shows a missing beneficiary signature before the ledger does", async () => {
    const { emulator, builder } = await setup("scalus");
    const vesting = { code: vestingCbor, version: "V3" as const };
    const fundedWallet = async (accountIndex: number) => {
      const wallet = await walletOf("payment", accountIndex);
      const address = (await wallet.getChangeAddress())!;
      emulator.fund(address, { lovelace: 100_000_000n });
      emulator.fund(address, { lovelace: 5_000_000n });
      return {
        wallet,
        address,
        keyHash: deserializeAddress(address).pubKeyHash,
      };
    };
    const owner = await fundedWallet(0);
    const beneficiary = await fundedWallet(1);
    const scriptAddress = builder.scriptAddress(vesting);

    const lockUntil = emulator.time + 3_600_000;
    const lock = await builder.build(
      [
        output({
          address: scriptAddress,
          value: { lovelace: 50_000_000n },
          datum: {
            type: "inline",
            data: mConStr0([lockUntil, owner.keyHash, beneficiary.keyHash]),
          },
        }),
      ],
      { payer: owner.address },
    );
    expectAgrees(lock);
    expect(
      await emulator.submitTx(
        await addWitnesses(lock.tx, await signWitnesses(owner.wallet, lock.tx)),
      ),
    ).toBe(lock.txHash);

    emulator.advanceTo({ time: lockUntil + 60_000 });
    const locked: UTxO = emulator.utxos({ address: scriptAddress })[0]!;
    const built = await builder.build(
      [
        spend.plutus({
          utxo: locked,
          script: vesting,
          redeemer: { data: mConStr0([]) },
        }),
        guard.pubKey({ keyHash: beneficiary.keyHash, label: "beneficiary" }),
        validity({ from: lockUntil + 1 }),
      ],
      { payer: beneficiary.address },
    );
    expect(
      built.signers.keys.find((k) => k.keyHash === beneficiary.keyHash)?.roles,
    ).toContain("guard");
    expectAgrees(built);

    const byOwner = await addWitnesses(
      built.tx,
      await signWitnesses(owner.wallet, built.tx),
    );
    expect(await signedKeyHashes(byOwner)).not.toContain(beneficiary.keyHash);
    const refused = await emulator.simulate(byOwner);
    expect(refused.accepted).toBe(false);
    expect(rules(refused)).toContain("MissingKeyHashes");

    const byBeneficiary = await addWitnesses(
      built.tx,
      await signWitnesses(beneficiary.wallet, built.tx),
    );
    expect(await signedKeyHashes(byBeneficiary)).toEqual([beneficiary.keyHash]);
    expect(await emulator.submitTx(byBeneficiary)).toBe(built.txHash);
  });
});
