import {
  mConStr0,
  NativeScript,
  PoolParams,
  resolveNativeScriptHash,
  resolveScriptRef,
  UTxO,
} from "@meshsdk/core";
import {
  Address,
  keyHashToRewardAddress,
  resolvePlutusScriptAddress,
  scriptHashToRewardAddress,
} from "@meshsdk/core-cst";

import {
  certificate,
  collateral,
  collateralReturn,
  output,
  proposal,
  referenceInput,
  spend,
  TxPartError,
  withdrawal,
} from "../../../src/tx-builder";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  keyHashHex,
  rewardAddress,
} from "../../test-util";

/** The bytes of an address, in hex */
const hexOf = (address: string) =>
  Address.fromString(address)!.toBytes().toString();

const keyAddress = baseAddress(1);
const byronAddress =
  "DdzFFzCqrhswh7xiYG8RE1TtcvWamhbExTXfsCYaF9PrGWHRLCwCsBH5JkeApUagvo4FZE3DJD3rn5hw8vaMBib2StKMJ77rJHt51jPt";
const keyStake = rewardAddress(1);
const nativeScript: NativeScript = { type: "all", scripts: [] };
const nativeStake = scriptHashToRewardAddress(
  resolveNativeScriptHash(nativeScript),
  0,
);
const plutusStake = scriptHashToRewardAddress(alwaysSucceedHash, 0);
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const redeemer = { data: mConStr0([]) };
const anchor = { url: "https://example.com/r.json", dataHash: "cd".repeat(32) };
const value = { lovelace: 2_000_000n };

const utxo = (
  outputIndex: number,
  address: string,
  output: Partial<UTxO["output"]> = {},
): UTxO => ({
  input: { txHash: "a".repeat(64), outputIndex },
  output: {
    address,
    amount: [{ unit: "lovelace", quantity: "5000000" }],
    ...output,
  },
});

const expectPartError = (build: () => unknown, code: string) => {
  try {
    build();
  } catch (error) {
    expect(error).toBeInstanceOf(TxPartError);
    expect((error as TxPartError).code).toBe(code);
    return error as TxPartError;
  }
  throw new Error(`expected a ${code} error`);
};

describe("addresses given to parts", () => {
  it("are stored in canonical text: bech32, or base58 for Byron", () => {
    const stored = (address: string) => [
      output({ address, value }).output.address,
      collateralReturn({ address }).address,
    ];

    expect(stored(hexOf(keyAddress))).toEqual([keyAddress, keyAddress]);
    expect(stored(hexOf(byronAddress))).toEqual([byronAddress, byronAddress]);
    expect(stored(keyAddress)).toEqual([keyAddress, keyAddress]);
    expect(stored(byronAddress)).toEqual([byronAddress, byronAddress]);
    expect(stored(keyAddress.toUpperCase())).toEqual([keyAddress, keyAddress]);
  });

  it("store a reward address given in hex as bech32", () => {
    const hex = (address: string) => hexOf(address);

    expect(
      withdrawal.pubKey({ rewardAddress: hex(keyStake), amount: 0n })
        .rewardAddress,
    ).toBe(keyStake);
    expect(
      withdrawal.native({
        rewardAddress: hex(nativeStake),
        amount: 0n,
        script: nativeScript,
      }).rewardAddress,
    ).toBe(nativeStake);
    expect(
      withdrawal.plutus({
        rewardAddress: hex(plutusStake),
        amount: 0n,
        script: plutusScript,
        redeemer,
      }).rewardAddress,
    ).toBe(plutusStake);

    const params: PoolParams = {
      operator: keyHashHex(7),
      vrfKeyHash: "cd".repeat(32),
      pledge: "1000000000",
      cost: "340000000",
      margin: [1, 100],
      owners: [],
      rewardAddress: hex(keyStake),
      relays: [],
    };
    expect(certificate.poolRegistration({ params }).certificate).toMatchObject({
      value: { pool_params: { reward_account: keyStake } },
    });

    expect(
      proposal.info({ rewardAccount: hex(keyStake), anchor }).proposal
        .reward_account,
    ).toBe(keyStake);

    const treasury = proposal.treasuryWithdrawals({
      rewardAccount: keyStake,
      anchor,
      withdrawals: { [hex(rewardAddress(2))]: 5n },
    });
    expect(treasury.proposal.governance_action).toMatchObject({
      value: { withdrawals: { [rewardAddress(2)]: "5" } },
    });
  });

  it("refuse one treasury account given twice, in two texts", () => {
    const error = expectPartError(
      () =>
        proposal.treasuryWithdrawals({
          rewardAccount: keyStake,
          anchor,
          withdrawals: { [hexOf(keyStake)]: 5n, [keyStake]: 7n },
        }),
      "INVALID_VALUE",
    );
    expect(error.message).toContain(`reward account ${keyStake} given twice`);
  });

  it("are stored as bech32 inside a UTxO given in full, in the part's copy only", () => {
    const hexAddress = hexOf(keyAddress);
    const plain = utxo(0, hexAddress);
    const holder = utxo(1, hexAddress, {
      scriptRef: resolveScriptRef(plutusScript),
    });
    const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);

    expect(spend.pubKey({ utxo: plain }).utxo!.output.address).toBe(keyAddress);
    expect(referenceInput({ utxo: plain }).utxo!.output.address).toBe(
      keyAddress,
    );
    expect(collateral({ utxo: plain }).utxo!.output.address).toBe(keyAddress);
    const spent = spend.plutus({
      utxo: utxo(2, scriptAddress),
      script: { reference: holder },
      redeemer,
    });
    expect(spent.witness).toMatchObject({
      script: { utxo: { output: { address: keyAddress } } },
    });

    expect(plain.output.address).toBe(hexAddress);
    expect(holder.output.address).toBe(hexAddress);
  });

  it("keep their checks, which quote the address as given", () => {
    const hexStake = hexOf(keyHashToRewardAddress("a".repeat(56), 0));

    const fromOutput = expectPartError(
      () => output({ address: hexStake, value }),
      "INVALID_ADDRESS",
    );
    expect(fromOutput.message).toContain(hexStake);
    const fromReturn = expectPartError(
      () => collateralReturn({ address: hexStake }),
      "INVALID_ADDRESS",
    );
    expect(fromReturn.message).toContain(hexStake);
    expectPartError(
      () => output({ address: "00ff", value }),
      "INVALID_ADDRESS",
    );

    const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);
    expectPartError(
      () => spend.pubKey({ utxo: utxo(0, hexOf(scriptAddress)) }),
      "WITNESS_MISMATCH",
    );

    const fromKeyWithdrawal = expectPartError(
      () =>
        withdrawal.pubKey({ rewardAddress: hexOf(plutusStake), amount: 0n }),
      "WITNESS_MISMATCH",
    );
    expect(fromKeyWithdrawal.message).toContain(hexOf(plutusStake));
    expectPartError(
      () =>
        withdrawal.plutus({
          rewardAddress: hexOf(keyStake),
          amount: 0n,
          script: plutusScript,
          redeemer,
        }),
      "WITNESS_MISMATCH",
    );
    expectPartError(
      () =>
        withdrawal.native({
          rewardAddress: hexOf(plutusStake),
          amount: 0n,
          script: nativeScript,
        }),
      "WITNESS_MISMATCH",
    );
  });
});
