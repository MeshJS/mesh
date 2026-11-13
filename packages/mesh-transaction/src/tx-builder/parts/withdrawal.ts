import {
  checkCredential,
  fail,
  freeze,
  labelOf,
  partContext,
  PartContext,
  rewardCredential,
  toNativeScriptSource,
  toPlutusScriptSource,
  toRedeemer,
  toRewardAddress,
  withKnownHash,
} from "./normalize";
import {
  KeyWitness,
  NativeScriptInput,
  NativeWitness,
  PlutusScriptInput,
  PlutusWitness,
  RedeemerInput,
  WithdrawalPart,
} from "./types";

type Credential = ReturnType<typeof rewardCredential>;

type WithdrawalParams = {
  /** The stake address, in bech32 or hex */
  rewardAddress: string;
  /**
   * Lovelace to withdraw, which must be the whole reward balance; `"all"` looks the balance
   * up before assembly. `0n` runs a staking script without withdrawing anything.
   */
  amount: bigint | "all";
  label?: string;
};

/** A script's withdrawal, whose reward address may be left out */
type ScriptWithdrawalParams = Omit<WithdrawalParams, "rewardAddress"> & {
  /**
   * The stake address, in bech32 or hex. Left out: the script's own reward address, derived on
   * the builder's network; it cannot be left out for a script referenced by out ref alone
   * without `scriptHash`
   */
  rewardAddress?: string;
};

const build = (
  params: ScriptWithdrawalParams,
  makeWitness: (
    ctx: PartContext,
    credential: Credential | undefined,
  ) => KeyWitness | NativeWitness | PlutusWitness,
  keyOnly = false,
): WithdrawalPart => {
  const ctx = partContext("withdrawal", params);
  // A key credential has no script to derive the address from: `pubKey` always parses it
  const given =
    params.rewardAddress === undefined && !keyOnly
      ? undefined
      : toRewardAddress(ctx, params.rewardAddress!);
  const { amount } = params;
  if (amount !== "all" && (typeof amount !== "bigint" || amount < 0n))
    fail(ctx, "INVALID_VALUE", `invalid withdrawal amount ${amount}`);
  const witness = makeWitness(ctx, given?.credential);
  if (given)
    checkCredential(
      ctx,
      params.rewardAddress!,
      given.credential,
      witness.type === "key"
        ? { type: "key" }
        : { type: "script", hash: witness.script.scriptHash },
    );
  // Without an address the part keeps the script's credential: its hash, which must be known
  else if (witness.type !== "key" && witness.script.scriptHash === undefined)
    fail(
      ctx,
      "INVALID_SCRIPT",
      "the script hash is unknown: pass rewardAddress, scriptHash, or the reference UTxO in full",
    );
  return freeze({
    kind: "withdrawal",
    ...(given && { rewardAddress: given.address }),
    ...(amount !== "all" && { amount: amount.toString() }),
    witness,
    ...labelOf(params.label),
  });
};

/**
 * Withdrawal parts. A script's reward address may be left out: the part keeps the script's
 * credential and the build derives the address on its network.
 */
export const withdrawal = {
  /**
   * Withdraw rewards from a stake address with a key stake credential.
   * @param params.rewardAddress The stake address, in bech32 or hex
   * @param params.amount The whole reward balance, or `"all"` to look it up
   * @param params.label Name echoed in errors about this part
   */
  pubKey: (params: WithdrawalParams): WithdrawalPart =>
    build(params, () => ({ type: "key" }), true),

  /**
   * Withdraw rewards from a stake address with a native script stake credential.
   * @param params.script The script: attached as a `NativeScript` or its CBOR, or held in a
   *   reference output (`{ reference }`)
   * @param params.rewardAddress Left out: the script's own reward address; given: checked
   *   against the script hash at the call and against the network at build. Needed for a script
   *   referenced by out ref alone, without `scriptHash`
   * @param params.amount The whole reward balance, or `"all"` to look it up; `0n` runs the
   *   script without withdrawing anything
   * @param params.label Name echoed in errors about this part
   */
  native: (
    params: ScriptWithdrawalParams & { script: NativeScriptInput },
  ): WithdrawalPart =>
    build(params, (ctx, credential) => ({
      type: "native",
      script: withKnownHash(
        toNativeScriptSource(ctx, params.script),
        credential,
      ),
    })),

  /**
   * Withdraw rewards from a stake address with a Plutus script stake credential.
   * @param params.script The script: attached (`{ code, version }`, the code flat or in one or
   *   two CBOR wrappings) or held in a reference output (`{ reference }`)
   * @param params.redeemer Data, or a function of the final transaction (`self`: this reward
   *   account's index among the withdrawals), with execution units if already known
   * @param params.rewardAddress Left out: the script's own reward address; given: checked
   *   against the script hash at the call and against the network at build. Needed for a script
   *   referenced by out ref alone, without `scriptHash`
   * @param params.amount The whole reward balance, or `"all"` to look it up; `0n` runs the
   *   script without withdrawing anything (withdraw-zero)
   * @param params.label Name echoed in errors about this part, such as a script failure
   */
  plutus: (
    params: ScriptWithdrawalParams & {
      script: PlutusScriptInput;
      redeemer: RedeemerInput;
    },
  ): WithdrawalPart =>
    build(params, (ctx, credential) => ({
      type: "plutus",
      script: withKnownHash(
        toPlutusScriptSource(ctx, params.script),
        credential,
      ),
      redeemer: toRedeemer(ctx, params.redeemer),
    })),
};
