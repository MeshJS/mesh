import { mConStr0, MConStr0, mConStr1, MConStr1 } from "./constructors";

/**
 * The Mesh Data verification key
 */
export type MVerificationKey = MConStr0<[string]>;

/**
 * The Mesh Data script key
 */
export type MScript = MConStr1<[string]>;

/**
 * The Mesh Data staking credential
 */
export type MMaybeStakingHash =
  | MConStr1<[]>
  | MConStr0<[MConStr0<[MVerificationKey]>]>
  | MConStr0<[MConStr0<[MScript]>]>;

/**
 * The Mesh Data public key address
 */
export type MPubKeyAddress = MConStr0<[MVerificationKey, MMaybeStakingHash]>;

/**
 * The Mesh Data script address
 */
export type MScriptAddress = MConStr0<[MScript, MMaybeStakingHash]>;

/**
 * The Mesh Data credential
 */
export type MCredential = MVerificationKey | MScript;

/**
 * The utility function to create a Mesh Data verification key
 * @param bytes The public key hash in hex
 * @returns The Mesh Data verification key object
 */
export const mVerificationKey = (bytes: string): MVerificationKey =>
  mConStr0([bytes]);

/**
 * The utility function to create a Mesh Data script key
 * @param bytes The script hash in hex
 * @returns The Mesh Data script key object
 */
export const mScript = (bytes: string): MScript => mConStr1([bytes]);

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
    return mConStr0([mConStr0([mScript(stakeCredential)])]) as MConStr0<
      [MConStr0<[MScript]>]
    >;
  }
  return mConStr0([mConStr0([mVerificationKey(stakeCredential)])]) as MConStr0<
    [MConStr0<[MVerificationKey]>]
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
): MPubKeyAddress =>
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
): MScriptAddress =>
  mConStr0([
    { alternative: 1, fields: [bytes] },
    mMaybeStakingHash(stakeCredential || "", isStakeScriptCredential),
  ]);

/**
 * The utility function to create a Mesh Data credential
 * @param hash The pub key hash or script hash
 * @param isScriptCredential Indicate if the credential is script hash (false for pub key hash)
 * @returns Mesh Data credential object
 */
export const mCredential = (
  hash: string,
  isScriptCredential = false,
): MCredential => (isScriptCredential ? mScript(hash) : mVerificationKey(hash));
