import type {
  BootstrapWitnessPrototype,
  CredTypePrototype,
  NativeScript,
  NativeScriptPrototype,
  VkeywitnessPrototype,
} from "@meshsdk/common";
import {
  Address,
  CborWriter,
  CredentialType,
  fromNativeScript,
  HexBlob,
  Serialization,
} from "@meshsdk/core-cst";

import type {
  CertificatePart,
  KeyWitness,
  NativeScriptSource,
  NativeWitness,
  PlutusWitness,
  TxPart,
  Utxo,
} from "./parts/types";
import { nativeScriptToPrototype } from "./parts/normalize";

/** Who has to sign a transaction: key hashes, and Byron addresses spent from */
export type Signers = { keyHashes: Set<string>; byronAddresses: Set<string> };

/**
 * Why a key must sign. `"guard"` is a key the transaction states as a required signer.
 * `RequiredKey.roles` lists the roles of a key in the order of these members.
 *
 * The list is open: later ledger eras and versions of this library may add roles, so code that
 * reads it keeps a default branch.
 */
export type SignerRole =
  | "input"
  | "collateral"
  | "certificate"
  | "withdrawal"
  | "vote"
  | "proposal"
  | "guard"
  | "poolOwner";

/** The place of each member of `SignerRole` in `RequiredKey.roles`: the order of the members */
const ROLE_ORDER: Record<SignerRole, number> = {
  input: 0,
  collateral: 1,
  certificate: 2,
  withdrawal: 3,
  vote: 4,
  proposal: 5,
  guard: 6,
  poolOwner: 7,
};

/** A key the transaction needs a vkey witness of, with every role it is needed in */
export type RequiredKey = {
  keyHash: string;
  /**
   * Why the key must sign: every role it is needed in, each once, in the order of the members of
   * `SignerRole`
   */
  roles: SignerRole[];
};

/**
 * Who must sign, as the builder works it out to size the fee. Keys named only by native scripts
 * are not in `keyHashes`: which of them sign is the script's choice.
 */
export type TxSigners = {
  /** Keys that must all sign, each once, in the order the parts first need them */
  keyHashes: string[];
  /** One entry per key of `keyHashes`, in the same order, with the roles it is needed in */
  keys: RequiredKey[];
  /** Byron addresses spent from, each needing a bootstrap witness */
  byronAddresses: string[];
  /** Native scripts that run, each once */
  nativeScripts: NativeScriptPrototype[];
};

/** What the parts of a transaction need signed, as it is collected */
export type Collected = {
  /** Keys the parts need, in the order first needed, with the roles they are needed in */
  keys: Map<string, Set<SignerRole>>;
  /** Every key a witness is priced for: the keys above and those native scripts name */
  priced: Set<string>;
  byronAddresses: Set<string>;
  /** Native scripts that run, by script hash */
  nativeScripts: Map<string, NativeScriptPrototype>;
};

/** Nothing collected yet */
export const emptyCollected = (): Collected => ({
  keys: new Map(),
  priced: new Set(),
  byronAddresses: new Set(),
  nativeScripts: new Map(),
});

export const addKey = (
  collected: Collected,
  keyHash: string,
  role: SignerRole,
) => {
  collected.priced.add(keyHash);
  const roles = collected.keys.get(keyHash);
  if (roles) roles.add(role);
  else collected.keys.set(keyHash, new Set([role]));
};

export const addCredential = (
  collected: Collected,
  credential: Readonly<CredTypePrototype> | undefined,
  role: SignerRole,
) => {
  if (credential?.type === "KEY") addKey(collected, credential.value, role);
};

export const addAddress = (
  collected: Collected,
  utxo: Readonly<Utxo> | undefined,
  role: SignerRole,
) => {
  if (!utxo) return;
  const address = Address.fromString(utxo.address);
  if (!address) return;
  if (address.asByron()) {
    collected.byronAddresses.add(utxo.address);
    return;
  }
  const payment = address.getProps().paymentPart;
  if (payment?.type === CredentialType.KeyHash)
    addKey(collected, payment.hash.toString(), role);
};

/** Every key a native script names, as any of them may be needed to satisfy it */
const addNativeScriptKeys = (
  collected: Collected,
  script: Readonly<NativeScriptPrototype>,
) => {
  switch (script.type) {
    case "SCRIPT_PUBKEY":
      collected.priced.add(script.value.addr_keyhash);
      return;
    case "SCRIPT_ALL":
    case "SCRIPT_ANY":
    case "SCRIPT_N_OF_K":
      script.value.native_scripts.forEach((s) =>
        addNativeScriptKeys(collected, s),
      );
      return;
    default:
      return;
  }
};

/** A native script in the form `TxSigners.nativeScripts` lists it, with its hash */
export const nativeScriptEntry = (
  native: Serialization.NativeScript,
): { script: NativeScriptPrototype; hash: string } => ({
  script: nativeScriptToPrototype(fromNativeScript(native) as NativeScript),
  hash: native.hash().toString(),
});

/** The native script a UTxO holds as its reference script, if it holds one */
export const nativeScriptRef = (
  utxo: Readonly<Utxo> | undefined,
): { script: NativeScriptPrototype; hash: string } | undefined =>
  utxo?.script?.type === "native"
    ? nativeScriptEntry(
        Serialization.NativeScript.fromCbor(HexBlob(utxo.script.cbor)),
      )
    : undefined;

/**
 * The script of a native witness and its hash, the script read from its reference output when
 * it is held there
 */
const nativeScriptOf = (
  source: NativeScriptSource,
): { script: NativeScriptPrototype; hash: string } | undefined =>
  source.type === "attached"
    ? {
        script: source.script as NativeScriptPrototype,
        hash: source.scriptHash,
      }
    : nativeScriptRef(source.utxo);

/** A native script that runs: listed once, and every key it names priced */
export const addNativeScript = (
  collected: Collected,
  native: { script: NativeScriptPrototype; hash: string },
) => {
  if (!collected.nativeScripts.has(native.hash))
    collected.nativeScripts.set(native.hash, native.script);
  addNativeScriptKeys(collected, native.script);
};

/** The native script of a witness, when it is one: listed once, and every key it names priced */
const addNativeWitness = (
  collected: Collected,
  witness: KeyWitness | NativeWitness | PlutusWitness | { type: "none" },
) => {
  if (witness.type !== "native") return;
  const native = nativeScriptOf(witness.script);
  if (native) addNativeScript(collected, native);
};

/** The keys a certificate is signed with, when it is witnessed by keys */
export const certificateKeys = (
  collected: Collected,
  part: Pick<CertificatePart, "certificate">,
) => {
  const { certificate } = part;
  switch (certificate.type) {
    case "POOL_REGISTRATION":
      addKey(collected, certificate.value.pool_params.operator, "certificate");
      certificate.value.pool_params.pool_owners.forEach((owner) =>
        addKey(collected, owner, "poolOwner"),
      );
      return;
    case "POOL_RETIREMENT":
      addKey(collected, certificate.value.pool_keyhash, "certificate");
      return;
    case "COMMITTEE_HOT_AUTH":
    case "COMMITTEE_COLD_RESIGN":
      addCredential(
        collected,
        certificate.value.committee_cold_credential,
        "certificate",
      );
      return;
    case "DREP_REGISTRATION":
    case "DREP_DEREGISTRATION":
    case "DREP_UPDATE":
      addCredential(
        collected,
        certificate.value.voting_credential,
        "certificate",
      );
      return;
    default:
      addCredential(
        collected,
        certificate.value.stake_credential,
        "certificate",
      );
  }
};

/** Everything the parts of a transaction need signed, in the order of the parts */
const collectSigners = (parts: readonly TxPart[]): Collected => {
  const collected = emptyCollected();
  for (const part of parts) {
    switch (part.kind) {
      case "spend":
        if (part.witness.type === "key")
          addAddress(collected, part.utxo, "input");
        else addNativeWitness(collected, part.witness);
        break;
      case "collateral":
        addAddress(collected, part.utxo, "collateral");
        break;
      case "guard":
        addKey(collected, part.credential.value, "guard");
        break;
      case "mint":
        addNativeWitness(collected, part.witness);
        break;
      case "withdrawal": {
        if (part.witness.type !== "key") {
          addNativeWitness(collected, part.witness);
          break;
        }
        // A key withdrawal always states its address
        const credential = Address.fromString(part.rewardAddress!)
          ?.asReward()
          ?.getPaymentCredential();
        if (credential?.type === CredentialType.KeyHash)
          addKey(collected, credential.hash.toString(), "withdrawal");
        break;
      }
      case "certificate":
        if (part.witness.type === "key") certificateKeys(collected, part);
        else addNativeWitness(collected, part.witness);
        break;
      case "vote":
        if (part.witness.type === "key") {
          if (part.voter.type === "STAKING_POOL")
            addKey(collected, part.voter.value, "vote");
          else addCredential(collected, part.voter.value, "vote");
        } else addNativeWitness(collected, part.witness);
        break;
      case "proposal":
        addNativeWitness(collected, part.witness);
        break;
      default:
        break;
    }
  }
  return collected;
};

/**
 * Everyone who has to sign a transaction made of these (resolved) parts, to price their
 * witnesses. Native scripts count every key they name, as which of them sign is not known in
 * advance; the fee is then enough for any of them.
 */
export const pricedSigners = (parts: readonly TxPart[]): Signers => {
  const { priced, byronAddresses } = collectSigners(parts);
  return { keyHashes: priced, byronAddresses };
};

/**
 * The keys a transaction made of these (resolved) parts needs signed, each with the roles it is
 * needed in; the Byron addresses it spends from; the native scripts it runs
 */
export const txSigners = (parts: readonly TxPart[]): TxSigners =>
  signersOf(collectSigners(parts));

/**
 * The keys the fee of a transaction counts, each once: the keys it needs, then those its native
 * scripts name, every one of which may sign
 */
export const countedKeys = (
  signers: Pick<TxSigners, "keyHashes" | "nativeScripts">,
): string[] => {
  const keys = new Set(signers.keyHashes);
  const visit = (script: NativeScriptPrototype) => {
    switch (script.type) {
      case "SCRIPT_PUBKEY":
        keys.add(script.value.addr_keyhash);
        return;
      case "SCRIPT_ALL":
      case "SCRIPT_ANY":
      case "SCRIPT_N_OF_K":
        script.value.native_scripts.forEach(visit);
        return;
      default:
        return;
    }
  };
  signers.nativeScripts.forEach(visit);
  return Array.from(keys);
};

/** What was collected, as `TxSigners` */
export const signersOf = (collected: Collected): TxSigners => {
  const keys = Array.from(collected.keys, ([keyHash, roles]) => ({
    keyHash,
    roles: [...roles].sort((a, b) => ROLE_ORDER[a] - ROLE_ORDER[b]),
  }));
  return {
    keyHashes: keys.map((k) => k.keyHash),
    keys,
    byronAddresses: Array.from(collected.byronAddresses),
    nativeScripts: Array.from(collected.nativeScripts.values()),
  };
};

const filler = (byte: number, bytes: number, index: number) =>
  index.toString(16).padStart(8, "0") +
  byte
    .toString(16)
    .padStart(2, "0")
    .repeat(bytes - 4);

/** Byron address attributes, encoded as a bootstrap witness carries them */
const byronAttributes = (address: string): number[] => {
  const attributes = Address.fromString(address)!.asByron()!.getAttributes();
  const writer = new CborWriter();
  writer.writeStartMap(
    (attributes.derivationPath ? 1 : 0) + (attributes.magic ? 1 : 0),
  );
  if (attributes.derivationPath) {
    writer.writeInt(1);
    writer.writeByteString(
      new CborWriter()
        .writeByteString(Buffer.from(attributes.derivationPath, "hex"))
        .encode(),
    );
  }
  if (attributes.magic) {
    writer.writeInt(2);
    writer.writeByteString(
      new CborWriter().writeInt(attributes.magic).encode(),
    );
  }
  return Array.from(writer.encode());
};

/**
 * Placeholder witnesses as large as the real ones, to size the transaction before it is signed
 * @param signers Who signs
 * @param extraKeys Further key witnesses expected beyond those
 */
export const placeholderWitnesses = (
  signers: Signers,
  extraKeys = 0,
): {
  vkeyWitnesses: VkeywitnessPrototype[];
  bootstrapWitnesses: BootstrapWitnessPrototype[];
} => {
  const keyCount = signers.keyHashes.size + extraKeys;
  const vkeyWitnesses = Array.from({ length: keyCount }, (_, i) => ({
    vkey: filler(0x11, 32, i),
    signature: filler(0x22, 64, i),
  }));
  const bootstrapWitnesses = Array.from(
    signers.byronAddresses,
    (address, i) => ({
      vkey: filler(0x33, 32, keyCount + i),
      signature: filler(0x44, 64, keyCount + i),
      chain_code: Array(32).fill(0),
      attributes: byronAttributes(address),
    }),
  );
  return { vkeyWitnesses, bootstrapWitnesses };
};
