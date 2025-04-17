import { pubKeyHash, PubKeyHash, scriptHash, ScriptHash } from "./aliases";
import { conStr0, ConStr0, conStr1, ConStr1 } from "./constructors";

/**
 * The Plutus Data verification key in JSON
 */
export type VerificationKey = ConStr0<[PubKeyHash]>;

/**
 * The Plutus Data Script key in JSON
 */
export type Script = ConStr1<[ScriptHash]>;

/**
 * The Plutus Data staking credential in JSON
 */
export type MaybeStakingHash =
  | ConStr1<[]>
  | ConStr0<[ConStr0<[VerificationKey]>]>
  | ConStr0<[ConStr0<[Script]>]>;

/**
 * The Plutus Data public key address in JSON
 */
export type PubKeyAddress = ConStr0<[VerificationKey, MaybeStakingHash]>;

/**
 * The Plutus Data script address in JSON
 */
export type ScriptAddress = ConStr0<[Script, MaybeStakingHash]>;

/**
 * The Plutus Data credential in JSON
 */
export type Credential = VerificationKey | Script;

/**
 * The utility function to create a Plutus Data verification key in JSON
 * @param bytes The public key hash in hex
 * @returns The Plutus Data verification key object
 */
export const verificationKey = (bytes: string): VerificationKey =>
  conStr0([pubKeyHash(bytes)]);

/**
 * The utility function to create a Plutus Data script key in JSON
 * @param bytes The script hash in hex
 * @returns The Plutus Data script key object
 * */
export const script = (bytes: string): Script => conStr1([scriptHash(bytes)]);

/**
 * The utility function to create a Plutus Data staking hash in JSON
 * @param stakeCredential The staking credential in hex
 * @param isStakeScriptCredential The flag to indicate if the credential is a script credential
 * @returns The Plutus Data staking hash object
 */
export const maybeStakingHash = (
  stakeCredential: string,
  isStakeScriptCredential = false,
): MaybeStakingHash => {
  if (stakeCredential === "") {
    return conStr1<[]>([]);
  }
  if (isStakeScriptCredential) {
    return conStr0([conStr0([script(stakeCredential)])]) as ConStr0<
      [ConStr0<[Script]>]
    >;
  }
  return conStr0([conStr0([verificationKey(stakeCredential)])]) as ConStr0<
    [ConStr0<[VerificationKey]>]
  >;
};

/**
 * The utility function to create a Plutus Data public key address in JSON
 * @param bytes The public key hash in hex
 * @param stakeCredential The staking credential in hex
 * @param isStakeScriptCredential The flag to indicate if the credential is a script credential
 * @returns The Plutus Data public key address object
 */
export const pubKeyAddress = (
  bytes: string,
  stakeCredential?: string,
  isStakeScriptCredential = false,
): PubKeyAddress =>
  conStr0([
    conStr0([pubKeyHash(bytes)]),
    maybeStakingHash(stakeCredential || "", isStakeScriptCredential),
  ]);

/**
 * The utility function to create a Plutus Data script address in JSON
 * @param bytes The validator hash in hex
 * @param stakeCredential The staking credential in hex
 * @param isStakeScriptCredential The flag to indicate if the stake credential is a script credential
 * @returns The Plutus Data script address object
 */
export const scriptAddress = (
  bytes: string,
  stakeCredential?: string,
  isStakeScriptCredential = false,
): ScriptAddress =>
  conStr0([
    script(bytes),
    maybeStakingHash(stakeCredential || "", isStakeScriptCredential),
  ]);

/**
 * The utility function to create a Plutus Data credential in JSON
 * @param hash The pub key hash or script hash
 * @param isScriptCredential Indicate if the credential is script hash (false for pub key hash)
 * @returns Plutus Data credential object
 */
export const credential = (
  hash: string,
  isScriptCredential = false,
): Credential => (isScriptCredential ? script(hash) : verificationKey(hash));
