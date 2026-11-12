import {
  deserializeAddress,
  mConStr0,
  NativeScript,
  Protocol,
  resolveNativeScriptHash,
  resolveScriptHash,
  resolveScriptRef,
  UTxO,
} from "@meshsdk/core";
import {
  resolvePlutusScriptAddress,
  scriptHashToRewardAddress,
} from "@meshsdk/core-cst";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import {
  BuiltTx,
  certificate,
  donation,
  mint,
  output,
  proposal,
  spend,
  TxBuilder,
  vote,
  withdrawal,
} from "../../src/tx-builder";
import { minFee } from "../../src/tx-builder/fee";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  mintParamCbor,
} from "../test-util";

const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);
const scriptRewardAddress = scriptHashToRewardAddress(alwaysSucceedHash, 0);
const plutusWitness = {
  plutus: plutusScript,
  redeemer: { data: mConStr0([]) },
};
const anchor = { url: "https://example.com/a.json", dataHash: "ab".repeat(32) };
// The emulator's preview parameters
const deposits = {
  drepDeposit: 500_000_000n,
  govActionDeposit: 1_000_000_000n,
};

const words = Array(24).fill("solution");
const walletOf = async (accountType: "payment" | "stake" | "drep") => {
  const wallet = new MeshWallet({
    networkId: 0,
    key: { type: "mnemonic", words },
    accountType,
  });
  await wallet.init();
  return wallet;
};

/*
 * Transactions built, signed and submitted to the emulator, whose ledger rules check every
 * balance, fee, deposit, witness, redeemer index and hash the builder works out.
 */
describe("TxBuilder on the emulator", () => {
  let provider: ScalusEmulator;
  let builder: TxBuilder;
  let address: string;
  let stakeAddress: string;
  let wallets: Record<"payment" | "stake" | "drep", MeshWallet>;
  let params: Protocol;

  const utxos = () => provider.fetchAddressUTxOs(address);
  const submit = async (
    built: BuiltTx,
    signers: ("payment" | "stake" | "drep")[] = ["payment"],
  ) => {
    let tx = built.tx;
    for (const signer of signers)
      tx = await wallets[signer].signTx(tx, signer !== "payment");
    // The fee is the minimum for the signed transaction, or a few bytes' worth above it: the
    // wallet encodes its key witnesses without the set tag the placeholders carry
    const { body } = built.prototype;
    let refScripts = 0n;
    for (const input of [...body.inputs, ...(body.reference_inputs ?? [])]) {
      const [utxo] = await provider.fetchUTxOs(
        input.transaction_id,
        input.index,
      );
      refScripts += BigInt((utxo?.output.scriptRef?.length ?? 0) / 2);
    }
    const min = minFee(tx.length / 2, refScripts, built.exUnits, params);
    expect(built.fee).toBeGreaterThanOrEqual(min);
    expect(built.fee - min).toBeLessThanOrEqual(5n * 44n);
    const txHash = await provider.submitTx(tx);
    expect(txHash).toBe(built.txHash);
    return txHash;
  };

  beforeEach(async () => {
    wallets = {
      payment: await walletOf("payment"),
      stake: await walletOf("stake"),
      drep: await walletOf("drep"),
    };
    address = (await wallets.payment.getChangeAddress())!;
    stakeAddress = (await wallets.payment.getRewardAddresses())[0]!;
    provider = await ScalusEmulator.create([
      ...[0, 1, 2].map((i): UTxO => ({
        input: { txHash: "0".repeat(64), outputIndex: i },
        output: {
          address,
          amount: [{ unit: "lovelace", quantity: "1000000000000" }],
        },
      })),
    ]);
    params = await provider.fetchProtocolParameters();
    builder = new TxBuilder({
      fetcher: provider,
      evaluator: provider,
      deposits,
    });
  });

  it("sends lovelace, returning change", async () => {
    const built = await builder.build({
      parts: [
        output({
          address: scriptAddress,
          value: { lovelace: 5_000_000n },
          label: "pay",
        }),
      ],
      changeAddress: address,
      utxos: await utxos(),
    });

    expect(built.selectedInputs).toHaveLength(1);
    expect(built.change).toHaveLength(1);
    expect(built.collateral).toBeUndefined();
    await submit(built);
  });

  it("mints under a native policy, then sends some of the tokens", async () => {
    const keyHash = deserializeAddress(address).pubKeyHash;
    const policy: NativeScript = { type: "sig", keyHash };
    const unit = `${resolveNativeScriptHash(policy)}0001`;
    const minted = await builder.build({
      parts: [
        mint.native({ script: policy, assets: { "0001": 1000n } }),
        output({ address, value: { [unit]: 1000n } }),
      ],
      changeAddress: address,
      utxos: await utxos(),
    });
    await submit(minted);

    const sent = await builder.build({
      parts: [output({ address: scriptAddress, value: { [unit]: 10n } })],
      changeAddress: address,
      utxos: await utxos(),
    });
    // The tokens left over come back as change
    expect(sent.change.map((o) => o.amount.multiasset)).toContainEqual({
      [unit.slice(0, 56)]: { "0001": "990" },
    });
    await submit(sent);
  });

  it("spends from a script by out ref alone, with a reference script and a collateral return", async () => {
    const setup = await builder.build({
      parts: [
        output({
          address: scriptAddress,
          value: { lovelace: 10_000_000n },
          datum: { type: "inline", data: mConStr0([]) },
        }),
        output({
          address,
          value: { lovelace: 20_000_000n },
          scriptRef: plutusScript,
        }),
      ],
      changeAddress: address,
      utxos: await utxos(),
    });
    const setupHash = await submit(setup);

    const built = await builder.build({
      parts: [
        spend.plutus({
          utxo: { txHash: setupHash, outputIndex: 0 },
          script: { reference: { txHash: setupHash, outputIndex: 1 } },
          redeemer: { data: mConStr0([]) },
          label: "unlock",
        }),
      ],
      changeAddress: address,
      // The wallet's UTxOs, without the reference script output
      utxos: (await utxos()).filter((u) => !u.output.scriptRef),
    });

    expect(built.redeemers).toEqual([
      expect.objectContaining({ tag: "SPEND", label: "unlock" }),
    ]);
    expect(built.redeemers[0]!.exUnits.mem).toBeGreaterThan(0);
    expect(built.collateral!.return).toBeDefined();
    expect(built.prototype.body.reference_inputs).toEqual([
      { transaction_id: setupHash, index: 1 },
    ]);
    await submit(built);
  });

  it("mints and burns under Plutus policies, each redeemer pointing at its policy", async () => {
    const policies = [7, 3, 11].map((n) => ({
      script: { code: mintParamCbor(n), version: "V3" as const },
      n,
    }));
    const units = policies.map(
      ({ script }) => `${resolveScriptHash(script.code, "V3")}01`,
    );
    const minted = await builder.build({
      parts: policies.map(({ script, n }) =>
        mint.plutus({
          script,
          redeemer: { data: n },
          assets: { "01": 5n },
        }),
      ),
      changeAddress: address,
      utxos: await utxos(),
    });
    await submit(minted);

    const burnt = await builder.build({
      parts: policies.map(({ script, n }) =>
        mint.plutus({
          script,
          redeemer: { data: n },
          assets: { "01": -5n },
        }),
      ),
      changeAddress: address,
      utxos: await utxos(),
    });
    expect(
      burnt.change.some((o) =>
        units.some((u) => o.amount.multiasset?.[u.slice(0, 56)]),
      ),
    ).toBe(false);
    await submit(burnt);
  });

  it("registers stake credentials, withdraws from script and key accounts in one transaction, and deregisters", async () => {
    const register = await builder.build({
      parts: [
        certificate.stakeRegistration({ stake: stakeAddress }),
        // Key accounts withdraw only once delegated to a DRep
        certificate.voteDelegation({
          stake: stakeAddress,
          drep: "alwaysAbstain",
        }),
        certificate.stakeRegistration({
          stake: scriptRewardAddress,
          witness: plutusWitness,
        }),
      ],
      changeAddress: address,
      utxos: await utxos(),
    });
    await submit(register, ["payment", "stake"]);

    // Script accounts come before key accounts in the ledger's order, whatever the hashes
    const withdraw = await builder.build({
      parts: [
        withdrawal.pubKey({ rewardAddress: stakeAddress, amount: 0n }),
        withdrawal.plutus({
          rewardAddress: scriptRewardAddress,
          amount: 0n,
          script: plutusScript,
          redeemer: { data: mConStr0([]) },
          label: "script",
        }),
      ],
      changeAddress: address,
      utxos: await utxos(),
    });
    expect(Object.keys(withdraw.prototype.body.withdrawals!)).toEqual([
      scriptRewardAddress,
      stakeAddress,
    ]);
    expect(withdraw.redeemers).toEqual([
      expect.objectContaining({ tag: "REWARD", index: 0, label: "script" }),
    ]);
    await submit(withdraw, ["payment", "stake"]);

    const before = await utxos();
    const deregister = await builder.build({
      parts: [
        certificate.stakeDeregistration({ stake: stakeAddress }),
        certificate.stakeDeregistration({
          stake: scriptRewardAddress,
          witness: plutusWitness,
        }),
      ],
      changeAddress: address,
      utxos: before,
    });
    // Both deposits come back with the change
    const spent = deregister.inputs.reduce(
      (sum, u) => sum + BigInt(u.output.amount[0]!.quantity),
      0n,
    );
    const change = deregister.change.reduce(
      (sum, o) => sum + BigInt(o.amount.coin),
      0n,
    );
    expect(change).toBe(spent + 4_000_000n - deregister.fee);
    await submit(deregister, ["payment", "stake"]);
  });

  it("registers DReps, proposes, and votes as script and key DReps in one transaction", async () => {
    const drep = (await wallets.payment.getDRep())!;
    const scriptDRep = { type: "SCRIPT" as const, value: alwaysSucceedHash };
    const register = await builder.build({
      parts: [
        // A proposal's deposit returns to a registered stake address
        certificate.stakeRegistration({ stake: stakeAddress }),
        certificate.drepRegistration({ drep: drep.dRepIDCip105 }),
        certificate.drepRegistration({
          drep: scriptDRep,
          witness: plutusWitness,
        }),
        proposal.info({ rewardAccount: stakeAddress, anchor }),
      ],
      changeAddress: address,
      utxos: await utxos(),
    });
    expect(register.prototype.body.voting_proposals![0]!.deposit).toBe(
      "1000000000",
    );
    const registerHash = await submit(register, ["payment", "stake", "drep"]);

    const votes = [
      { action: { txHash: registerHash, index: 0 }, vote: "yes" as const },
    ];
    const voted = await builder.build({
      parts: [
        vote({ voter: { drep: drep.dRepIDCip105 }, votes }),
        vote({
          voter: { drep: scriptDRep },
          votes,
          witness: plutusWitness,
          label: "script DRep",
        }),
      ],
      changeAddress: address,
      utxos: await utxos(),
    });
    expect(voted.redeemers).toEqual([
      expect.objectContaining({ tag: "VOTE", index: 0, label: "script DRep" }),
    ]);
    await submit(voted, ["payment", "drep"]);
  });

  it("donates to the treasury", async () => {
    const built = await builder.build({
      parts: [donation({ amount: 1_000_000n })],
      changeAddress: address,
      utxos: await utxos(),
    });
    expect(built.prototype.body.donation).toBe("1000000");
    await submit(built);
  });
});
