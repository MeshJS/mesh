/**
 * Codec for the Masumi `vested_pay` escrow lock datum (payment-v2 / `Web3CardanoV2`).
 *
 * Field layout ported from `x402-foundation/x402`'s reference implementation
 * (`typescript/packages/mechanisms/cardano/src/exact/masumi/datum.ts`, Apache-2.0) so the
 * two implementations produce byte-identical datums for the same inputs. Builds the
 * 19-field `Constr 0` datum for a fresh lock (`state = FundsLocked`, empty `result_hash`,
 * zero cooldowns) and parses it back for facilitator verification.
 */
import { DataB, DataConstr, DataI, DataList, dataFromCbor, Data as PlutusDataNode } from "@harmoniclabs/plutus-data";

import { deserializeBech32Address, serializeAddress } from "@meshsdk/core-cst";
import { Data, mConStr, mConStr0, mConStr1 } from "@meshsdk/common";

/** A payment or stake credential extracted from an address or datum. */
export type MasumiCredential = { isScript: boolean; hash: string };

/** Address split into its payment + optional stake credentials (pointer addresses are not supported). */
export type MasumiAddressCredentials = {
  payment: MasumiCredential;
  stake?: MasumiCredential;
};

export type MasumiLockDatumInput = {
  buyerAddress: string;
  sellerAddress: string;
  buyerReturnAddress?: string;
  sellerReturnAddress?: string;
  referenceKey: string;
  referenceSignature: string;
  sellerNonce: string;
  buyerNonce: string;
  agentIdentifier: string;
  collateralReturnLovelace: bigint;
  inputHash: string;
  payByTime: bigint;
  submitResultTime: bigint;
  unlockTime: bigint;
  externalDisputeUnlockTime: bigint;
};

export type MasumiDatumView = {
  buyer: MasumiAddressCredentials;
  buyerReturnAddress: MasumiAddressCredentials | null;
  seller: MasumiAddressCredentials;
  sellerReturnAddress: MasumiAddressCredentials | null;
  referenceKey: string;
  referenceSignature: string;
  sellerNonce: string;
  buyerNonce: string;
  agentIdentifier: string;
  collateralReturnLovelace: bigint;
  inputHash: string;
  resultHash: string;
  payByTime: bigint;
  submitResultTime: bigint;
  unlockTime: bigint;
  externalDisputeUnlockTime: bigint;
  sellerCooldownTime: bigint;
  buyerCooldownTime: bigint;
  state: number;
};

/** The state constructor index for a fresh lock. */
export const MASUMI_STATE_FUNDS_LOCKED = 0;

/** `vested_pay.ak`'s `State` enum, in declaration order (Plutus constructor index = position). */
export const MASUMI_STATE = {
  FundsLocked: 0,
  ResultSubmitted: 1,
  RefundRequested: 2,
  Disputed: 3,
  WithdrawAuthorized: 4,
  RefundAuthorized: 5,
} as const;

export const credentialToData = (cred: MasumiCredential): Data =>
  cred.isScript ? mConStr1([cred.hash]) : mConStr0([cred.hash]);

/** Encodes already-decoded address credentials as the Plutus `Address` shape the validator expects. */
export const credentialsToData = (creds: MasumiAddressCredentials): Data => {
  const stakeOption: Data = creds.stake
    ? mConStr0([mConStr0([credentialToData(creds.stake)])])
    : mConStr1([]);
  return mConStr0([credentialToData(creds.payment), stakeOption]);
};

export const optionCredentialsToData = (creds: MasumiAddressCredentials | null | undefined): Data =>
  creds ? mConStr0([credentialsToData(creds)]) : mConStr1([]);

/** Extracts the payment and (optional) stake credentials of a base/enterprise bech32 address. */
export const addressCredentials = (bech32: string): MasumiAddressCredentials => {
  const parsed = deserializeBech32Address(bech32);
  const payment = parsed.pubKeyHash
    ? { isScript: false, hash: parsed.pubKeyHash }
    : parsed.scriptHash
      ? { isScript: true, hash: parsed.scriptHash }
      : undefined;
  if (!payment) throw new Error(`Masumi datum address must have a payment credential: ${bech32}`);

  const stake = parsed.stakeCredentialHash
    ? { isScript: false, hash: parsed.stakeCredentialHash }
    : parsed.stakeScriptCredentialHash
      ? { isScript: true, hash: parsed.stakeScriptCredentialHash }
      : undefined;

  return stake ? { payment, stake } : { payment };
};

/** Inverse of `addressCredentials`: re-serializes decoded credentials back to a bech32 address. */
export const credentialsToBech32 = (creds: MasumiAddressCredentials, networkId: 0 | 1): string =>
  serializeAddress(
    {
      pubKeyHash: !creds.payment.isScript ? creds.payment.hash : undefined,
      scriptHash: creds.payment.isScript ? creds.payment.hash : undefined,
      stakeCredentialHash: creds.stake && !creds.stake.isScript ? creds.stake.hash : undefined,
      stakeScriptCredentialHash: creds.stake && creds.stake.isScript ? creds.stake.hash : undefined,
    },
    networkId,
  );

/**
 * Builds the Masumi datum (`Constr 0`, 19 fields) from a full field view, as a Mesh `Data`
 * value. Used both for a fresh lock (via `buildMasumiLockDatum`) and for every spend action's
 * continuation datum (via `spend/continuation.ts`), which mutate only 2-4 of these fields
 * relative to the currently-parsed on-chain datum.
 */
export const buildMasumiDatum = (view: MasumiDatumView): Data =>
  mConStr0([
    credentialsToData(view.buyer), // 0 buyer
    optionCredentialsToData(view.buyerReturnAddress), // 1 buyer_return_address
    credentialsToData(view.seller), // 2 seller
    optionCredentialsToData(view.sellerReturnAddress), // 3 seller_return_address
    view.referenceKey, // 4 reference_key
    view.referenceSignature, // 5 reference_signature
    view.sellerNonce, // 6 seller_nonce
    view.buyerNonce, // 7 buyer_nonce
    view.agentIdentifier, // 8 agent_identifier
    view.collateralReturnLovelace, // 9 collateral_return_lovelace
    view.inputHash, // 10 input_hash
    view.resultHash, // 11 result_hash
    view.payByTime, // 12 pay_by_time
    view.submitResultTime, // 13 submit_result_time
    view.unlockTime, // 14 unlock_time
    view.externalDisputeUnlockTime, // 15 external_dispute_unlock_time
    view.sellerCooldownTime, // 16 seller_cooldown_time
    view.buyerCooldownTime, // 17 buyer_cooldown_time
    mConStr(view.state, []), // 18 state
  ]);

/** Builds the Masumi lock datum (`Constr 0`, 19 fields) for a fresh lock, as a Mesh `Data` value. */
export const buildMasumiLockDatum = (input: MasumiLockDatumInput): Data =>
  buildMasumiDatum({
    buyer: addressCredentials(input.buyerAddress),
    buyerReturnAddress: input.buyerReturnAddress ? addressCredentials(input.buyerReturnAddress) : null,
    seller: addressCredentials(input.sellerAddress),
    sellerReturnAddress: input.sellerReturnAddress ? addressCredentials(input.sellerReturnAddress) : null,
    referenceKey: input.referenceKey,
    referenceSignature: input.referenceSignature,
    sellerNonce: input.sellerNonce,
    buyerNonce: input.buyerNonce,
    agentIdentifier: input.agentIdentifier,
    collateralReturnLovelace: input.collateralReturnLovelace,
    inputHash: input.inputHash,
    resultHash: "",
    payByTime: input.payByTime,
    submitResultTime: input.submitResultTime,
    unlockTime: input.unlockTime,
    externalDisputeUnlockTime: input.externalDisputeUnlockTime,
    sellerCooldownTime: 0n,
    buyerCooldownTime: 0n,
    state: MASUMI_STATE_FUNDS_LOCKED,
  });

// --- decode (facilitator side, parses an inline datum's CBOR hex) ---

type ConstrView = { index: number; fields: PlutusDataNode[] };

const asConstr = (d: PlutusDataNode): ConstrView | null =>
  d instanceof DataConstr ? { index: Number(d.constr), fields: d.fields } : null;
const asInt = (d: PlutusDataNode): bigint | null => (d instanceof DataI ? d.int : null);
const asHex = (d: PlutusDataNode): string | null =>
  d instanceof DataB ? Buffer.from(d.bytes.toBuffer()).toString("hex").toLowerCase() : null;

/** Cardano payment/stake credential hashes are Blake2b-224: 28 bytes = 56 hex chars. */
const CREDENTIAL_HASH_HEX_LENGTH = 56;

const dataToCredential = (d: PlutusDataNode): MasumiCredential | null => {
  const c = asConstr(d);
  if (!c || (c.index !== 0 && c.index !== 1) || c.fields.length !== 1) return null;
  const hash = asHex(c.fields[0]!);
  if (hash === null || hash.length !== CREDENTIAL_HASH_HEX_LENGTH) return null;
  return { isScript: c.index === 1, hash };
};

const dataToAddress = (d: PlutusDataNode): MasumiAddressCredentials | null => {
  const c = asConstr(d);
  if (!c || c.index !== 0 || c.fields.length !== 2) return null;
  const payment = dataToCredential(c.fields[0]!);
  if (!payment) return null;
  const opt = asConstr(c.fields[1]!);
  if (!opt) return null;
  if (opt.index === 1) return opt.fields.length === 0 ? { payment } : null; // None
  if (opt.index !== 0 || opt.fields.length !== 1) return null;
  const stakeRef = asConstr(opt.fields[0]!);
  if (!stakeRef || stakeRef.index !== 0 || stakeRef.fields.length !== 1) return null; // pointer addresses unsupported
  const stake = dataToCredential(stakeRef.fields[0]!);
  return stake ? { payment, stake } : null;
};

const dataToOptionAddress = (
  d: PlutusDataNode,
): { value: MasumiAddressCredentials | null } | null => {
  const c = asConstr(d);
  if (!c) return null;
  if (c.index === 1 && c.fields.length === 0) return { value: null }; // None
  if (c.index !== 0 || c.fields.length !== 1) return null; // Some(addr)
  const addr = dataToAddress(c.fields[0]!);
  return addr ? { value: addr } : null;
};

/**
 * Parses a Masumi lock datum (CBOR hex, as read off an on-chain inline datum) into a typed
 * view. Total: returns `null` when the structure does not match the 19-field datum.
 */
export const parseMasumiLockDatum = (datumCbor: string): MasumiDatumView | null => {
  let data: PlutusDataNode;
  try {
    data = dataFromCbor(datumCbor);
  } catch {
    return null;
  }
  const root = asConstr(data);
  if (!root || root.index !== 0 || root.fields.length !== 19) return null;
  const f = root.fields;

  const buyer = dataToAddress(f[0]!);
  const buyerReturnAddress = dataToOptionAddress(f[1]!);
  const seller = dataToAddress(f[2]!);
  const sellerReturnAddress = dataToOptionAddress(f[3]!);
  const referenceKey = asHex(f[4]!);
  const referenceSignature = asHex(f[5]!);
  const sellerNonce = asHex(f[6]!);
  const buyerNonce = asHex(f[7]!);
  const agentIdentifier = asHex(f[8]!);
  const collateralReturnLovelace = asInt(f[9]!);
  const inputHash = asHex(f[10]!);
  const resultHash = asHex(f[11]!);
  const payByTime = asInt(f[12]!);
  const submitResultTime = asInt(f[13]!);
  const unlockTime = asInt(f[14]!);
  const externalDisputeUnlockTime = asInt(f[15]!);
  const sellerCooldownTime = asInt(f[16]!);
  const buyerCooldownTime = asInt(f[17]!);
  // The state constructor carries no fields; `FundsLocked` is `Constr 0 []`. Accepting
  // `Constr 0 [junk]` would let through a datum the validator's typed decode rejects on
  // every later spend, stranding the escrow.
  const stateConstr = asConstr(f[18]!);
  if (stateConstr !== null && stateConstr.fields.length !== 0) return null;

  if (
    !buyer ||
    !buyerReturnAddress ||
    !seller ||
    !sellerReturnAddress ||
    referenceKey === null ||
    referenceSignature === null ||
    sellerNonce === null ||
    buyerNonce === null ||
    agentIdentifier === null ||
    collateralReturnLovelace === null ||
    inputHash === null ||
    resultHash === null ||
    payByTime === null ||
    submitResultTime === null ||
    unlockTime === null ||
    externalDisputeUnlockTime === null ||
    sellerCooldownTime === null ||
    buyerCooldownTime === null ||
    !stateConstr
  ) {
    return null;
  }

  return {
    buyer,
    buyerReturnAddress: buyerReturnAddress.value,
    seller,
    sellerReturnAddress: sellerReturnAddress.value,
    referenceKey,
    referenceSignature,
    sellerNonce,
    buyerNonce,
    agentIdentifier,
    collateralReturnLovelace,
    inputHash,
    resultHash,
    payByTime,
    submitResultTime,
    unlockTime,
    externalDisputeUnlockTime,
    sellerCooldownTime,
    buyerCooldownTime,
    state: stateConstr.index,
  };
};
