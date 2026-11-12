import { deserializeAddress } from "@meshsdk/core";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import { BuiltTx, certificate, output, TxBuilder } from "../../src/tx-builder";
import { baseAddress } from "../test-util";

const words = Array(24).fill("solution");
const recipient = baseAddress(2);

const walletOf = async (accountType: "payment" | "stake") => {
  const wallet = new MeshWallet({
    networkId: 0,
    key: { type: "mnemonic", words },
    accountType,
  });
  await wallet.init();
  return wallet;
};

/*
 * What a built transaction reports, checked by the emulator's ledger under both validators.
 */
describe.each(["scalus", "cquisitor"] as const)(
  "TxBuilder results on TxEmulator (%s)",
  (validator) => {
    it("is accepted signed by exactly the keys of signers.keyHashes, and refused without one", async () => {
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
      const wallets = {
        payment: await walletOf("payment"),
        stake: await walletOf("stake"),
      };
      const address = (await wallets.payment.getChangeAddress())!;
      const stake = (await wallets.payment.getRewardAddresses())[0]!;
      emulator.fund(address, { lovelace: 100_000_000n });
      const { pubKeyHash, stakeCredentialHash } = deserializeAddress(address);

      const built = await builder.build(
        [
          output({ address: recipient, value: { lovelace: 5_000_000n } }),
          certificate.stakeRegistration({ stake, label: "register" }),
        ],
        {
          payer: { changeAddress: address, utxos: emulator.utxos({ address }) },
        },
      );
      expect([...built.signers.keyHashes].sort()).toEqual(
        [pubKeyHash, stakeCredentialHash].sort(),
      );
      expect(built.signers.keys).toEqual(
        expect.arrayContaining([
          {
            keyHash: pubKeyHash,
            neededBy: [{ part: "spend", role: "input" }],
          },
          {
            keyHash: stakeCredentialHash,
            neededBy: [
              { part: "certificate", label: "register", role: "certificate" },
            ],
          },
        ]),
      );

      // The wallet of each key signs, and only those
      const keyOf = { payment: pubKeyHash, stake: stakeCredentialHash };
      const signWith = async (tx: BuiltTx, skip?: string) => {
        let signed = tx.tx;
        for (const role of ["payment", "stake"] as const) {
          const keyHash = keyOf[role];
          if (!tx.signers.keyHashes.includes(keyHash) || keyHash === skip)
            continue;
          signed = await wallets[role].signTx(signed, role !== "payment");
        }
        return signed;
      };

      const fork = emulator.fork();
      await expect(
        fork.submitTx(await signWith(built, stakeCredentialHash)),
      ).rejects.toThrow(stakeCredentialHash);
      expect(await emulator.submitTx(await signWith(built))).toBe(built.txHash);
    });
  },
);
