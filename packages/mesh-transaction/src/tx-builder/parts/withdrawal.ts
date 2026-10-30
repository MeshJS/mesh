import {
  checkCredential,
  fail,
  freeze,
  labelOf,
  PartContext,
  rewardCredential,
  toNativeScriptSource,
  toPlutusScriptSource,
  toRedeemer,
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
  /** The stake address, in bech32 */
  rewardAddress: string;
  /**
   * Lovelace to withdraw, which must be the whole reward balance; `"all"` looks the balance
   * up before assembly. `0n` runs a staking script without withdrawing anything.
   */
  amount: bigint | "all";
  label?: string;
};

const build = (
  params: WithdrawalParams,
  makeWitness: (
    ctx: PartContext,
    credential: Credential,
  ) => KeyWitness | NativeWitness | PlutusWitness,
): WithdrawalPart => {
  const ctx: PartContext = { part: "withdrawal", label: params.label };
  const credential = rewardCredential(ctx, params.rewardAddress);
  const { amount } = params;
  if (amount !== "all" && (typeof amount !== "bigint" || amount < 0n))
    fail(ctx, "INVALID_VALUE", `invalid withdrawal amount ${amount}`);
  const witness = makeWitness(ctx, credential);
  checkCredential(
    ctx,
    params.rewardAddress,
    credential,
    witness.type === "key"
      ? { type: "key" }
      : { type: "script", hash: witness.script.scriptHash },
  );
  return freeze({
    kind: "withdrawal",
    rewardAddress: params.rewardAddress,
    ...(amount !== "all" && { amount: amount.toString() }),
    witness,
    ...labelOf(params.label),
  });
};

export const withdrawal = {
  /**
   * Withdraw rewards from a stake address with a key stake credential.
   * @param params.rewardAddress The stake address, in bech32
   * @param params.amount The whole reward balance, or `"all"` to look it up
   * @param params.label Name echoed in errors about this part
   */
  pubKey: (params: WithdrawalParams): WithdrawalPart =>
    build(params, () => ({ type: "key" })),

  /**
   * Withdraw rewards from a stake address with a native script stake credential.
   * @param params.script The script: attached as a `NativeScript` or its CBOR, or held in a
   *   reference output (`{ reference }`)
   */
  native: (
    params: WithdrawalParams & { script: NativeScriptInput },
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
   * @param params.script The script: attached (`{ code, version }`) or held in a reference
   *   output (`{ reference }`)
   * @param params.redeemer Redeemer data, with execution units if already known
   */
  plutus: (
    params: WithdrawalParams & {
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
