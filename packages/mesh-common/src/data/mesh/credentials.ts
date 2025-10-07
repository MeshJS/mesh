import { mConStr0, MConStr0, mConStr1, MConStr1 } from "./constructors";

/**
 * @typealias MVerificationKey
 * @description
 * Represents a Mesh Data verification key as a constructor object with a public key hash in hex.
 *
 * @purpose
 * TODO
 *
 * @property {MConStr0<[string]>}
 *   Constructor object with a single string field for the public key hash (hex).
 *   - Example: `mConStr0(["f275cb75d82f..."])`
 */
export type MVerificationKey = MConStr0<[string]>;

/**
 * @typealias MScript
 * @description
 * Represents a Mesh Data script key as a constructor object with a script hash in hex.
 *
 * @purpose
 * TODO
 *
 * @property {MConStr1<[string]>}
 *   Constructor object with a single string field for the script hash (hex).
 *   - Example: `mConStr1(["1c84c63dcea3..."])`
 */
export type MScript = MConStr1<[string]>;

/**
 * @typealias MMaybeStakingHash
 * @description
 * Represents a Mesh Data staking credential as a constructor object for optional staking hashes.
 *
 * @purpose
 * TODO
 *
 * @property {MConStr1<[]> | MConStr0<[MConStr0<[MVerificationKey]>]> | MConStr0<[MConStr0<[MScript]>]>}
 *   - `MConStr1<[]>`: No staking credential.
 *   - `MConStr0<[MConStr0<[MVerificationKey]>]>`: Staking credential as verification key.
 *   - `MConStr0<[MConStr0<[MScript]>]>`: Staking credential as script.
 *   - Example: `mConStr1([])` or `mConStr0([mConStr0([mVerificationKey("f275cb75d82f...")])])`
 */
export type MMaybeStakingHash =
  | MConStr1<[]>
  | MConStr0<[MConStr0<[MVerificationKey]>]>
  | MConStr0<[MConStr0<[MScript]>]>;

/**
 * @typealias MPubKeyAddress
 * @description
 * Represents a Mesh Data public key address as a constructor object with verification key and optional staking hash.
 *
 * @purpose
 * TODO
 *
 * @property {MConStr0<[MVerificationKey, MMaybeStakingHash]>}
 *   Constructor object with verification key and optional staking hash.
 *   - Example: `mConStr0([mVerificationKey("f275cb75d82f..."), mConStr1([])])`
 */
export type MPubKeyAddress = MConStr0<[MVerificationKey, MMaybeStakingHash]>;

/**
 * @typealias MScriptAddress
 * @description
 * Represents a Mesh Data script address as a constructor object with script key and optional staking hash.
 *
 * @purpose
 * TODO
 *
 * @property {MConStr0<[MScript, MMaybeStakingHash]>}
 *   Constructor object with script key and optional staking hash.
 *   - Example: `mConStr0([mScript("1c84c63dcea3..."), mConStr1([])])`
 */
export type MScriptAddress = MConStr0<[MScript, MMaybeStakingHash]>;

/**
 * @typealias MCredential
 * @description
 * Represents a Mesh Data credential as either a verification key or script key.
 *
 * @purpose
 * TODO
 *
 * @property {MVerificationKey | MScript}
 *   Credential object, either verification key or script key.
 *   - Example: `mVerificationKey("f275cb75d82f...")` or `mScript("1c84c63dcea3...")`
 */
export type MCredential = MVerificationKey | MScript;

/**
 * @function mVerificationKey
 * @description
 * Creates a Mesh Data verification key object from a public key hash in hex format.
 *
 * @purpose
 * TODO
 *
 * @param {string} bytes
 * The public key hash in hex.
 *   - Must be a valid hex string.
 *   - Example value: `"f275cb75d82f..."`
 *
 * @returns {MVerificationKey}
 * Mesh Data verification key object.
 *   - Example: `mConStr0(["f275cb75d82f..."])`
 */
export const mVerificationKey = (bytes: string): MVerificationKey =>
  mConStr0([bytes]);

/**
 * @function mScript
 * @description
 * Creates a Mesh Data script key object from a script hash in hex format.
 *
 * @purpose
 * TODO
 *
 * @param {string} bytes
 * The script hash in hex.
 *   - Must be a valid hex string.
 *   - Example value: `"1c84c63dcea3..."`
 *
 * @returns {MScript}
 * Mesh Data script key object.
 *   - Example: `mConStr1(["1c84c63dcea3..."])`
 */
export const mScript = (bytes: string): MScript => mConStr1([bytes]);

/**
 * @function mMaybeStakingHash
 * @description
 * Creates a Mesh Data staking hash object from a staking credential in hex format.
 *
 * @purpose
 * TODO
 *
 * @param {string} stakeCredential
 * The staking credential in hex.
 *   - Must be a valid hex string or empty string for no staking credential.
 *   - Example value: `"f275cb75d82f..."`
 *
 * @param {boolean} isStakeScriptCredential
 * The flag to indicate if the credential is a script credential.
 *   - Optional; defaults to `false`.
 *
 * @returns {MMaybeStakingHash}
 * Mesh Data staking hash object.
 *   - Example: `mConStr1([])` or `mConStr0([mConStr0([mVerificationKey("f275cb75d82f...")])])`
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
 * @function mPubKeyAddress
 * @description
 * Creates a Mesh Data public key address object from a public key hash and optional staking credential.
 *
 * @purpose
 * TODO
 *
 * @param {string} bytes
 * The public key hash in hex.
 *   - Must be a valid hex string.
 *   - Example value: `"f275cb75d82f..."`
 *
 * @param {string} [stakeCredential]
 * The staking credential in hex.
 *   - Optional; must be a valid hex string or empty string.
 *   - Example value: `"f275cb75d82f..."`
 *
 * @param {boolean} isStakeScriptCredential
 * The flag to indicate if the credential is a script credential.
 *   - Optional; defaults to `false`.
 *
 * @returns {MPubKeyAddress}
 * Mesh Data public key address object.
 *   - Example: `mConStr0([mVerificationKey("f275cb75d82f..."), mConStr1([])])`
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
 * @function mScriptAddress
 * @description
 * Creates a Mesh Data script address object from a validator hash and optional staking credential.
 *
 * @purpose
 * TODO
 *
 * @param {string} bytes
 * The validator hash in hex.
 *   - Must be a valid hex string.
 *   - Example value: `"1c84c63dcea3..."`
 *
 * @param {string} [stakeCredential]
 * The staking credential in hex.
 *   - Optional; must be a valid hex string or empty string.
 *   - Example value: `"f275cb75d82f..."`
 *
 * @param {boolean} isStakeScriptCredential
 * The flag to indicate if the credential is a script credential.
 *   - Optional; defaults to `false`.
 *
 * @returns {MScriptAddress}
 * Mesh Data script address object.
 *   - Example: `mConStr0([mScript("1c84c63dcea3..."), mConStr1([])])`
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
 * @function mCredential
 * @description
 * Creates a Mesh Data credential object from a pub key hash or script hash.
 *
 * @purpose
 * TODO
 *
 * @param {string} hash
 * The pub key hash or script hash.
 *   - Must be a valid hex string.
 *   - Example value: `"f275cb75d82f..."`
 *
 * @param {boolean} isScriptCredential
 * Indicate if the credential is script hash (false for pub key hash).
 *   - Optional; defaults to `false`.
 *
 * @returns {MCredential}
 * Mesh Data credential object.
 *   - Example: `mVerificationKey("f275cb75d82f...")` or `mScript("1c84c63dcea3...")`
 */
export const mCredential = (
  hash: string,
  isScriptCredential = false,
): MCredential => (isScriptCredential ? mScript(hash) : mVerificationKey(hash));
