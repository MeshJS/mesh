import { Data } from "../../types";
import { mConStr0, MConStr0, mConStr1, MConStr1 } from "./constructors";

/**
 * The Mesh Data staking credential
 */
export type MMaybeStakingHash =
  | MConStr1<[]>
  | MConStr0<[MConStr0<[MConStr0<[string]>]>]>
  | MConStr0<[MConStr0<[MConStr1<[string]>]>]>;

/**
 * The Mesh Data public key address
 */
export type MPubKeyAddress = MConStr0<[MConStr0<[string]>, MMaybeStakingHash]>;

/**
 * The Mesh Data script address
 */
export type MScriptAddress = MConStr0<[MConStr1<[string]>, MMaybeStakingHash]>;

/**
 * The utility function to create a Mesh Data staking hash
 * @param stakeCredential The staking credential in hex
 * @param isStakeScriptCredential The flag to indicate if the credential is a script credential
 * @returns The Mesh Data staking hash object
 */
export const mMaybeStakingHash = (
  stakeCredential: string,
  isStakeScriptCredential = false,
): MMaybeStakingHash => {
  if (stakeCredential === "") {
    return mConStr1<[]>([]);
  }
  if (isStakeScriptCredential) {
    return mConStr0([mConStr0([mConStr1([stakeCredential])])]) as MConStr0<
      [MConStr0<[MConStr1<[string]>]>]
    >;
  }
  return mConStr0([mConStr0([mConStr0([stakeCredential])])]) as MConStr0<
    [MConStr0<[MConStr0<[string]>]>]
  >;
};

/**
 * The utility function to create a Mesh Data public key address
 * @param bytes The public key hash in hex
 * @param stakeCredential The staking credential in hex
 * @param isStakeScriptCredential The flag to indicate if the credential is a script credential
 * @returns The Mesh Data public key address object
 */
export const mPubKeyAddress = (
  bytes: string,
  stakeCredential?: string,
  isStakeScriptCredential = false,
): Data =>
  mConStr0([
    { alternative: 0, fields: [bytes] },
    mMaybeStakingHash(stakeCredential || "", isStakeScriptCredential),
  ]);

/**
 * The utility function to create a Mesh Data script address
 * @param bytes The validator hash in hex
 * @param stakeCredential The staking credential in hex
 * @param isStakeScriptCredential The flag to indicate if the credential is a script credential
 * @returns The Mesh Data script address object
 */
export const mScriptAddress = (
  bytes: string,
  stakeCredential?: string,
  isStakeScriptCredential = false,
): Data =>
  mConStr0([
    { alternative: 1, fields: [bytes] },
    mMaybeStakingHash(stakeCredential || "", isStakeScriptCredential),
  ]);
