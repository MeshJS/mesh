import { bech32 } from "bech32";

import { mnemonicToEntropy } from "@meshsdk/common";
import { applyCborEncoding, deserializeAddress, mConStr0 } from "@meshsdk/core";
import {
  Crypto,
  deserializeTx,
  resolvePlutusScriptAddress,
  Serialization,
} from "@meshsdk/core-cst";
import { TxEmulator, TxResult } from "@meshsdk/tx-emulator";

import {
  BuiltTx,
  certificate,
  collateral,
  collateralReturn,
  guard,
  keySigner,
  output,
  signedKeyHashes,
  spend,
  TxBuilder,
  TxBuildError,
  TxPlanError,
} from "../../src/tx-builder";
import { scriptDataHashOf } from "../../src/tx-builder/hashes";
import { alwaysFailCbor, alwaysSucceedCbor } from "../test-util";
import {
  arr,
  bytes,
  map,
  mapPairs,
  tag258,
  topItems,
  txHashOf,
  tx as txOf,
  uint,
  vkeyWitness,
} from "./cbor-util";
import { hashSigner, keysSigner, testKey } from "./hash-signer-util";
import {
  caught,
  Hooks,
  pay,
  submitterOf,
  walletOf,
  words,
  wrap,
} from "./plan/plan-emulator-util";

// A transaction that exists only as CBOR, made into an object by a builder that did not build
// it, signed, submitted and looked for on the emulator.

const HARDENED = 0x80000000;
const QUICK = { timeoutMs: 2_000, pollMs: 10 } as const;

const rules = (result: TxResult) =>
  result.accepted ? [] : result.errors.map((e) => e.rule);
/** The ledger rule a fee below the minimum breaks, under each validator */
const feeRule = {
  scalus: "FeesOk",
  cquisitor: "FeeTooSmallUTxO",
} as const;

/** Signers over the payment key and the stake key of the tests' seed, each alone */
const seedKeys = async () => {
  await Crypto.ready();
  const account = Crypto.Bip32PrivateKey.fromBip39Entropy(
    Buffer.from(mnemonicToEntropy(words.join(" ")), "hex"),
    "",
  ).derive([HARDENED + 1852, HARDENED + 1815, HARDENED]);
  const asText = (prefix: string, key: Crypto.Bip32PrivateKey) =>
    bech32.encode(prefix, bech32.toWords(Buffer.from(key.hex(), "hex")), 1023);
  return {
    payment: keySigner(asText("addr_xsk", account.derive([0, 0]))),
    stake: keySigner(asText("stake_xsk", account.derive([2, 0]))),
  };
};

/**
 * An emulator of preprod, a maker's builder and a co-signer's builder on it, each over a provider
 * of its own, and the seed's wallet funded
 * @param hooks What the co-signer's provider changes in what it answers
 */
const setup = async (validator: "scalus" | "cquisitor", hooks: Hooks = {}) => {
  const emulator = await TxEmulator.create({
    validator,
    network: "preprod",
    slot: 100_000_000,
  });
  const builderOver = (provider: TxEmulator) =>
    new TxBuilder({ network: "preprod", provider, evaluator: emulator });
  const maker = builderOver(wrap(emulator));
  const coProvider = wrap(emulator, hooks);
  const coSigner = builderOver(coProvider);
  const wallet = await walletOf();
  const address = (await wallet.getChangeAddress())!;
  emulator.fund(address, { lovelace: 100_000_000n });
  return {
    emulator,
    maker,
    coSigner,
    coProvider,
    builderOver,
    wallet,
    address,
  };
};

/** The keys with their roles, in an order of their own */
const sortedKeys = (signers: BuiltTx["signers"]) =>
  [...signers.keys].sort((a, b) => a.keyHash.localeCompare(b.keyHash));

describe.each(["scalus", "cquisitor"] as const)(
  "TxBuilder.fromCbor on TxEmulator (%s)",
  (validator) => {
    it("lets a co-signer sign what the maker left, submit it and find it in a block", async () => {
      const { emulator, maker, coSigner, wallet, address } =
        await setup(validator);
      const keys = await seedKeys();
      const { pubKeyHash, stakeCredentialHash } = deserializeAddress(address);
      const rewardAddress = (await wallet.getRewardAddresses())[0]!;
      const built = await maker.build(
        [certificate.stakeRegistration({ stake: rewardAddress })],
        { payer: address },
      );
      await built.sign({ signers: keys.payment });
      // All the co-signer is given
      const handed = built.partialTx;

      const tx = await coSigner.fromCbor(handed);
      expect(tx).toBeInstanceOf(BuiltTx);
      expect(tx.txHash).toBe(built.txHash);
      expect(tx.tx).toBe(built.tx);
      expect(tx.partialTx).toBe(handed);
      expect(sortedKeys(tx.signers)).toEqual(sortedKeys(built.signers));
      expect(tx.signers.keyHashes.sort()).toEqual(
        [pubKeyHash, stakeCredentialHash].sort(),
      );
      expect(tx.missing.map((k) => k.keyHash)).toEqual([stakeCredentialHash]);
      expect(tx.signedTx).toBeUndefined();
      expect(tx.inputs).toEqual(built.inputs);
      expect(tx.fee).toBe(built.fee);

      // It has no payer: who signs is named
      const nobody = await caught(tx.sign());
      expect(TxPlanError.is(nobody, "MISSING_SIGNATURES")).toBe(true);
      await tx.sign({ signers: keys.stake });
      expect(tx.missing).toEqual([]);
      expect(tx.signedTx).toBe(
        (await built.sign({ signers: keys.stake })).signedTx,
      );
      expect(await tx.submit()).toBe(tx);
      const found = await tx.awaitInclusion(QUICK);
      expect(found.txHash).toBe(built.txHash);
      expect((await emulator.fetchTxInfo(built.txHash)).hash).toBe(
        built.txHash,
      );
    });

    it("submits a transaction that came fully signed at once, and finds it; restored from its JSON first, the same", async () => {
      const { maker, coSigner, wallet, address } = await setup(validator);
      for (const throughJson of [false, true]) {
        const built = await maker.build(pay(3_000_000n + BigInt(throughJson)), {
          payer: address,
        });
        await built.sign({ signers: wallet });
        const given = built.signedTx!;

        const made = await coSigner.fromCbor(given);
        expect(made.missing).toEqual([]);
        expect(made.signedTx).toBe(given);
        expect(made.tx).toBe(built.tx);
        const tx = throughJson
          ? await coSigner.restore(JSON.parse(JSON.stringify(made)))
          : made;
        expect({ ...tx }).toEqual({ ...made });
        expect(tx.signedTx).toBe(given);
        expect(await tx.submit()).toBe(tx);
        expect((await tx.awaitInclusion(QUICK)).txHash).toBe(built.txHash);
      }
    });

    it("sends a transaction of the exact minimum fee as it came, its vkey list without the set tag over a body with tagged sets; written with the tag, the ledger refuses its fee", async () => {
      const { emulator, coSigner } = await setup(validator);
      const params = await emulator.fetchProtocolParameters();
      await Crypto.ready();
      const key = testKey();
      const funded = emulator.fund(key.address, { lovelace: 10_000_000n });
      const to = `60${key.keyHash}`;
      const bodyOf = (fee: number) =>
        map(
          [
            uint(0),
            tag258(
              arr(
                arr(bytes(funded.input.txHash), uint(funded.input.outputIndex)),
              ),
            ),
          ],
          [
            uint(1),
            arr(map([uint(0), bytes(to)], [uint(1), uint(10_000_000 - fee)])),
          ],
          [uint(2), uint(fee)],
        );
      const signed = (fee: number, tagged: boolean) => {
        const bodyHex = bodyOf(fee);
        const list = arr(vkeyWitness(key, txHashOf(bodyHex)));
        return txOf(bodyHex, map([uint(0), tagged ? tag258(list) : list]));
      };
      let fee = 200_000;
      for (let i = 0; i < 5; i++)
        fee = params.minFeeA * (signed(fee, false).length / 2) + params.minFeeB;
      const given = signed(fee, false);
      expect(fee).toBe(params.minFeeA * (given.length / 2) + params.minFeeB);
      expect((await emulator.simulate(given)).accepted).toBe(true);
      // The same transaction with the set tag on its vkey list: three bytes more, the same fee
      const withTag = signed(fee, true);
      expect(withTag.length / 2).toBe(given.length / 2 + 3);
      expect(rules(await emulator.simulate(withTag))).toContain(
        feeRule[validator],
      );

      const tx = await coSigner.fromCbor(given);
      expect(tx.missing).toEqual([]);
      expect(tx.signedTx).toBe(given);
      expect(await tx.submit()).toBe(tx);
      expect((await tx.awaitInclusion(QUICK)).txHash).toBe(tx.txHash);
    });

    describe("a Plutus spend", () => {
      const script = { code: alwaysSucceedCbor, version: "V3" as const };

      /** A script output locked by the wallet and on chain, and its spend, built unsigned */
      const unlocking = async () => {
        const setUp = await setup(validator);
        const { maker, wallet, address, emulator } = setUp;
        const scriptAddress = maker.scriptAddress(script);
        const lock = await maker.build(
          output({
            address: scriptAddress,
            value: { lovelace: 20_000_000n },
            datum: { type: "inline", data: mConStr0([]) },
          }),
          { payer: address },
        );
        await (await lock.sign({ signers: wallet })).submit();
        const utxo = emulator.utxos({ address: scriptAddress })[0]!;
        const unlock = await maker.build(
          [spend.plutus({ utxo, script, redeemer: { data: mConStr0([]) } })],
          { payer: address },
        );
        return { ...setUp, unlock };
      };

      it("is accepted signed through the object, its script data hash holding, and found with its validity; CANNOT_OBSERVE (noValidity) on a provider that does not say", async () => {
        const { emulator, coSigner, builderOver, wallet, unlock } =
          await unlocking();
        const tx = await coSigner.fromCbor(unlock.tx);
        expect(tx.redeemers).toEqual(
          unlock.redeemers.map(({ part: _part, label: _label, ...r }) => r),
        );
        expect(tx.exUnits).toEqual(unlock.exUnits);
        expect(tx.collateral).toEqual(unlock.collateral);
        expect(sortedKeys(tx.signers)).toEqual(sortedKeys(unlock.signers));
        await tx.sign({ signers: wallet });
        expect((await emulator.simulate(tx.signedTx!)).accepted).toBe(true);
        expect(await tx.submit()).toBe(tx);
        expect((await emulator.fetchTxInfo(tx.txHash)).validContract).toBe(
          true,
        );
        expect((await tx.awaitInclusion(QUICK)).txHash).toBe(unlock.txHash);

        // A provider that does not say whether the scripts passed; the inputs are spent by then
        const mute = builderOver(
          wrap(emulator, {
            fetchTxInfo: async (forward, hash) => {
              const { validContract: _valid, ...info } = await forward(hash);
              return info;
            },
          }),
        );
        const again = await mute.fromCbor(tx.signedTx!, {
          knownUtxos: [
            ...unlock.inputs,
            ...unlock.collateral!.inputs,
            ...unlock.referenceInputs,
          ],
        });
        const error = await caught(again.awaitInclusion(QUICK));
        expect([error.code, error.details]).toEqual([
          "CANNOT_OBSERVE",
          { reason: "noValidity" },
        ]);
      });
    });

    it("is UTXO_NOT_FOUND for a transaction in a block already, which the emulator lists no outputs of; with knownUtxos it is made, submit() returns on the ledger's refusal, and awaitInclusion() returns", async () => {
      const { emulator, maker, builderOver, wallet, address } =
        await setup(validator);
      const built = await maker.build(pay(), { payer: address });
      await built.sign({ signers: wallet });
      await built.submit();
      await built.awaitInclusion(QUICK);

      // Another builder, whose cache has read nothing yet
      const later = builderOver(wrap(emulator));
      const error = await caught(later.fromCbor(built.signedTx!));
      expect(error).toBeInstanceOf(TxBuildError);
      expect([error.code, error.details]).toEqual([
        "UTXO_NOT_FOUND",
        {
          input: {
            txHash: built.inputs[0]!.txHash,
            outputIndex: built.inputs[0]!.outputIndex,
          },
        },
      ]);
      expect(error.message).toContain("knownUtxos");

      const tx = await later.fromCbor(built.signedTx!, {
        knownUtxos: built.inputs,
      });
      expect(tx.missing).toEqual([]);
      // The ledger refuses the bytes again: their inputs are spent, by this very transaction
      expect((await emulator.simulate(built.signedTx!)).accepted).toBe(false);
      const recording = submitterOf((bytes) => emulator.submitTx(bytes));
      expect(await tx.submit({ submitter: recording })).toBe(tx);
      expect(recording.calls).toEqual([built.signedTx]);
      expect((await tx.awaitInclusion(QUICK)).txHash).toBe(built.txHash);
    });

    it("is REJECTED with the ledger's error as its cause when the ledger refuses it and the provider does not find it", async () => {
      const { emulator, coSigner } = await setup(validator);
      await Crypto.ready();
      const key = testKey();
      const funded = emulator.fund(key.address, { lovelace: 10_000_000n });
      // A fee of 1 lovelace: the object sends it as it came
      const bodyHex = map(
        [
          uint(0),
          tag258(
            arr(
              arr(bytes(funded.input.txHash), uint(funded.input.outputIndex)),
            ),
          ),
        ],
        [
          uint(1),
          arr(
            map(
              [uint(0), bytes(`60${key.keyHash}`)],
              [uint(1), uint(9_999_999)],
            ),
          ),
        ],
        [uint(2), uint(1)],
      );
      const given = txOf(
        bodyHex,
        map([uint(0), tag258(arr(vkeyWitness(key, txHashOf(bodyHex))))]),
      );
      const tx = await coSigner.fromCbor(given);
      expect(tx.fee).toBe(1n);
      expect(tx.signedTx).toBe(given);
      const error = await caught(tx.submit());
      expect(error).toBeInstanceOf(TxPlanError);
      expect(error.code).toBe("REJECTED");
      expect(error.cause).toMatchObject({ kind: "rejected" });
      expect(rules(await emulator.simulate(given))).toContain(
        feeRule[validator],
      );
    });

    it("makes the second of two transactions not on chain with the outputs of the first as knownUtxos, and both land in order", async () => {
      const { maker, coSigner, wallet, address } = await setup(validator);
      const first = await maker.build(
        output({
          address,
          value: { lovelace: 7_000_000n },
          label: "seven",
        }),
        { payer: address },
      );
      const seven = first.outputs.find((o) => o.label === "seven")!;
      const second = await maker.build(
        [spend.pubKey({ utxo: seven }), pay(6_000_000n)],
        { payer: address, after: first },
      );

      const firstTx = await coSigner.fromCbor(first.tx);
      const unknown = await caught(coSigner.fromCbor(second.tx));
      expect(unknown.code).toBe("UTXO_NOT_FOUND");
      const secondTx = await coSigner.fromCbor(second.tx, {
        knownUtxos: firstTx.outputs,
      });
      expect(
        secondTx.inputs.some(
          (u) =>
            u.txHash === first.txHash && u.outputIndex === seven.outputIndex,
        ),
      ).toBe(true);
      for (const tx of [firstTx, secondTx]) {
        await tx.sign({ signers: wallet });
        await tx.submit();
      }
      expect((await firstTx.awaitInclusion(QUICK)).txHash).toBe(first.txHash);
      expect((await secondTx.awaitInclusion(QUICK)).txHash).toBe(second.txHash);
    });

    it("refuses a body with two output lists, the first paying the user back and the second the maker: nothing is shown, signed or sent, and the user's UTxO stays", async () => {
      await Crypto.ready();
      const user = testKey();
      const maker = testKey();
      const emulator = await TxEmulator.create({
        validator,
        network: "preprod",
        slot: 100_000_000,
      });
      const funded = emulator.fund(user.address, { lovelace: 500_000_000n });
      const paid = (key: ReturnType<typeof testKey>) =>
        arr(
          map(
            [uint(0), bytes(`60${key.keyHash}`)],
            [uint(1), uint(499_800_000)],
          ),
        );
      const body = map(
        [uint(0), tag258(arr(arr(bytes(funded.input.txHash), uint(0))))],
        [uint(1), paid(user)],
        [uint(1), paid(maker)],
        [uint(2), uint(200_000)],
      );
      const coSigner = new TxBuilder({
        network: "preprod",
        provider: emulator,
        evaluator: emulator,
      });
      const error = await caught(coSigner.fromCbor(txOf(body)));
      expect(error).toBeInstanceOf(TxBuildError);
      expect(error.code).toBe("INVALID_OPTION");
      expect(error.details).toEqual({
        option: "tx",
        value: "string",
        allowed: "a transaction in CBOR hex",
      });
      expect(error.message).toContain("a map in its body repeats a key");
      expect(
        emulator
          .utxos({ address: user.address })
          .map((u) => u.output.amount[0]!.quantity),
      ).toEqual(["500000000"]);
      expect(emulator.utxos({ address: maker.address })).toEqual([]);
    });

    it("warns of the user's whole collateral input put up beside the maker's and returned to the maker: the warning names its 500 ada, and the transaction marked as failing takes them", async () => {
      await Crypto.ready();
      const user = testKey();
      const maker = testKey();
      const emulator = await TxEmulator.create({
        validator,
        network: "preprod",
        slot: 100_000_000,
      });
      const userUtxo = emulator.fund(user.address, {
        lovelace: 500_000_000n,
      });
      const makerSmall = emulator.fund(maker.address, {
        lovelace: 7_000_000n,
      });
      emulator.fund(maker.address, { lovelace: 100_000_000n });
      const script = { code: alwaysFailCbor, version: "V3" as const };
      const locked = { txHash: "7".repeat(64), outputIndex: 0 };
      emulator.addUtxos([
        {
          input: locked,
          output: {
            address: resolvePlutusScriptAddress(script, 0),
            amount: [{ unit: "lovelace", quantity: "20000000" }],
            plutusData: "d87980",
          },
        },
      ]);
      // The maker spends from a script of its own that always fails
      const built = await new TxBuilder({
        network: "preprod",
        provider: emulator,
        evaluator: null,
      }).build(
        [
          spend.plutus({
            utxo: locked,
            script,
            redeemer: {
              data: mConStr0([]),
              exUnits: { mem: 1_000_000, steps: 500_000_000 },
            },
          }),
          collateral({ utxo: makerSmall.input }),
          collateral({ utxo: userUtxo.input }),
          collateralReturn({ address: maker.address }),
        ],
        { payer: maker.address },
      );
      const made = await new TxBuilder({
        network: "preprod",
        provider: emulator,
        evaluator: emulator,
      }).fromCbor(built.tx);
      expect(made.collateral!.return!.address).toBe(maker.address);
      expect(made.collateral!.total).toBeLessThan(1_000_000n);
      expect(made.warnings).toEqual([
        {
          code: "COLLATERAL_RETURN_ELSEWHERE",
          message:
            "the collateral return pays a payment credential that holds only some of the collateral inputs: if a script fails, the 500000000 lovelace of the collateral inputs of other holders go to the return's holder or to the fee, however small the total collateral the body states; the validity flag is not signed, so whoever submits the transaction can mark it as failing",
        },
      ]);
      expect(made.missing).toContainEqual({
        keyHash: user.keyHash,
        roles: ["collateral"],
      });

      // What the warning says happens: the user signs, and the maker adds its own signature and
      // marks the transaction as failing, which no signature covers
      await made.sign({ signers: keysSigner("object", user).signer });
      const flipped = deserializeTx(made.partialTx);
      const witnessSet = flipped.witnessSet();
      const vkeys = witnessSet.vkeys()!;
      vkeys.setValues([
        ...vkeys.values(),
        new Serialization.VkeyWitness(
          maker.vkey as never,
          maker.sign(made.txHash) as never,
        ),
      ]);
      witnessSet.setVkeys(vkeys);
      flipped.setWitnessSet(witnessSet);
      flipped.setIsValid(false);
      const result = await emulator.submit(flipped.toCbor());
      expect(rules(result)).toEqual([]);
      expect(emulator.utxos({ address: user.address })).toEqual([]);
    });

    describe("redeemers in the array form", () => {
      /**
       * The hello-world validator of the repository's contracts (aiken-workspace-v2), compiled:
       * it takes the redeemer constructor 0 of the bytes "Hello, World!" and the signature of the
       * key its datum names
       */
      const HELLO = applyCborEncoding(
        "59010801010032323232323225333002323232323253330073370e900118041baa0011323232533300a3370e900018059baa00513232533300f30110021533300c3370e900018069baa00313232533300e3371e6eb8c008c040dd5004a450d48656c6c6f2c20576f726c642100100114a06644646600200200644a66602800229404c94ccc048cdc79bae301600200414a2266006006002602c0026eb0c044c048c048c048c048c048c048c048c048c03cdd50051bae3001300f37546022601e6ea80108c0440045858dd7180780098061baa00516300d300e002300c001300937540022c6014601600460120026012004600e00260086ea8004526136565734aae7555cf2ab9f5742ae89",
      );
      const GOOD = "d8799f4d48656c6c6f2c20576f726c6421ff";
      const BAD = "d8799f4d48656c6c6f2c20576f726c6422ff";

      /**
       * The user's spend of a UTxO locked at the validator, its witness set holding these
       * redeemers in the array form, its script data hash made for them and signed by the user
       */
      const spendWith = async (redeemers: string[]) => {
        await Crypto.ready();
        const user = testKey();
        const emulator = await TxEmulator.create({
          validator,
          network: "preprod",
          slot: 100_000_000,
        });
        emulator.fund(user.address, { lovelace: 500_000_000n });
        emulator.fund(user.address, { lovelace: 50_000_000n });
        const script = { code: HELLO, version: "V3" as const };
        const locked = { txHash: "7".repeat(64), outputIndex: 0 };
        emulator.addUtxos([
          {
            input: locked,
            output: {
              address: resolvePlutusScriptAddress(script, 0),
              amount: [{ unit: "lovelace", quantity: "20000000" }],
              plutusData: `d8799f581c${user.keyHash}ff`,
            },
          },
        ]);
        const builder = new TxBuilder({
          network: "preprod",
          provider: emulator,
          evaluator: null,
        });
        const built = await builder.build(
          [
            spend.plutus({
              utxo: locked,
              script,
              redeemer: {
                data: { type: "CBOR", content: GOOD },
                exUnits: { mem: 2_000_000, steps: 800_000_000 },
              },
            }),
            guard.pubKey({ keyHash: user.keyHash }),
          ],
          { payer: user.address },
        );
        const [body, witnessSet] = topItems(built.tx);
        const units = arr(uint(200_000), uint(80_000_000));
        const entries = mapPairs(witnessSet!).map(
          ([key, value]): [string, string] => [
            key,
            key === uint(5)
              ? arr(
                  ...redeemers.map((data) =>
                    arr(uint(0), uint(0), data, units),
                  ),
                )
              : value,
          ],
        );
        const scriptDataHash = scriptDataHashOf(
          txOf(body!, map(...entries)),
          new Set(["V3"]),
          (await builder.chain()).costModels,
        )!;
        const newBody = map(
          ...mapPairs(body!).map(([key, value]): [string, string] => [
            key,
            key === uint(11) ? bytes(scriptDataHash) : value,
          ]),
        );
        const signed = txOf(
          newBody,
          map(
            [uint(0), tag258(arr(vkeyWitness(user, txHashOf(newBody))))],
            ...entries,
          ),
        );
        const coSigner = new TxBuilder({
          network: "preprod",
          provider: emulator,
          evaluator: emulator,
        });
        return { emulator, signed, coSigner };
      };

      it("refuses two redeemers of one purpose in either order, which the two validators read in different ways", async () => {
        for (const order of [
          [GOOD, BAD],
          [BAD, GOOD],
        ]) {
          const { signed, coSigner } = await spendWith(order);
          const error = await caught(coSigner.fromCbor(signed));
          expect(error).toBeInstanceOf(TxBuildError);
          expect(error.details).toEqual({
            option: "tx",
            value: "string",
            allowed: "a transaction in CBOR hex",
          });
          expect(error.message).toBe(
            "invalid tx: the redeemers of its witness set name one purpose twice, which decoders read in different ways",
          );
        }
      });

      it("takes one redeemer of each purpose, which the ledger takes as the object shows it", async () => {
        const { signed, coSigner } = await spendWith([GOOD]);
        const made = await coSigner.fromCbor(signed);
        expect(made.redeemers.map((r) => [r.tag, r.index, r.data])).toEqual([
          ["SPEND", 0, GOOD],
        ]);
        expect(made.missing).toEqual([]);
        expect(made.signedTx).toBe(signed);
        await made.submit();
      });
    });

    it("keeps a witness of a key the transaction does not need that it came with, and the ledger takes the same bytes it takes as given; a signer's witness of another such key afterwards is dropped", async () => {
      const { emulator, maker, coSigner, wallet, address } =
        await setup(validator);
      await Crypto.ready();
      const { pubKeyHash } = deserializeAddress(address);
      const stranger = testKey();
      const another = testKey();
      /** A signer that answers with the key it holds, asked or not */
      const unasked = (key: ReturnType<typeof testKey>) =>
        hashSigner("object", ({ txHash }) => [key.answer(txHash)]).signer;

      // Its maker priced one witness of another key, and signed with it and the payment key
      const built = await maker.build(pay(), {
        payer: address,
        extraKeyWitnesses: 1,
      });
      // The signer of the other key first: a signer of hashes is not asked once none is left
      await built.sign({ signers: [unasked(stranger), wallet] });
      const given = built.signedTx!;
      expect((await signedKeyHashes(given)).sort()).toEqual(
        [pubKeyHash, stranger.keyHash].sort(),
      );
      const full = await coSigner.fromCbor(given);
      expect(full.missing).toEqual([]);
      expect(full.signedTx).toBe(given);
      expect(JSON.parse(JSON.stringify(full)).extraKeyWitnesses).toBe(1);
      expect((await emulator.simulate(full.signedTx!)).accepted).toBe(true);

      // The same transaction with the other key's witness alone; a signer then gives the
      // payment key and a third key: that one is dropped
      const partly = await maker.build(pay(), {
        payer: address,
        extraKeyWitnesses: 1,
      });
      await partly.sign({ signers: unasked(stranger) });
      const tx = await coSigner.fromCbor(partly.partialTx);
      expect(await signedKeyHashes(tx.partialTx)).toEqual([stranger.keyHash]);
      await tx.sign({ signers: [unasked(another), wallet] });
      expect((await signedKeyHashes(tx.signedTx!)).sort()).toEqual(
        [pubKeyHash, stranger.keyHash].sort(),
      );
      expect(await tx.submit()).toBe(tx);
      expect((await tx.awaitInclusion(QUICK)).txHash).toBe(partly.txHash);
    });
  },
);
