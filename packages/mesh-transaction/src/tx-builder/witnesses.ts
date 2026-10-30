import type {
  BootstrapWitnessPrototype,
  CredTypePrototype,
  NativeScript,
  NativeScriptPrototype,
  UTxO,
  VkeywitnessPrototype,
} from "@meshsdk/common";
import {
  Address,
  CborWriter,
  CredentialType,
  fromNativeScript,
  HexBlob,
  Script,
} from "@meshsdk/core-cst";

import type {
  CertificatePart,
  KeyWitness,
  NativeScriptSource,
  NativeWitness,
  PlutusWitness,
  TxPart,
} from "./parts/types";
import { nativeScriptToPrototype } from "./parts/normalize";

/** Who has to sign a transaction: key hashes, and Byron addresses spent from */
export type Signers = { keyHashes: Set<string>; byronAddresses: Set<string> };

const addCredential = (
  signers: Signers,
  credential: Readonly<CredTypePrototype> | undefined,
) => {
  if (credential?.type === "KEY") signers.keyHashes.add(credential.value);
};

const addAddress = (signers: Signers, utxo: Readonly<UTxO> | undefined) => {
  if (!utxo) return;
  const address = Address.fromString(utxo.output.address);
  if (!address) return;
  if (address.asByron()) {
    signers.byronAddresses.add(utxo.output.address);
    return;
  }
  const payment = address.getProps().paymentPart;
  if (payment?.type === CredentialType.KeyHash)
    signers.keyHashes.add(payment.hash.toString());
};

const addNativeScript = (
  signers: Signers,
  script: Readonly<NativeScriptPrototype>,
) => {
  switch (script.type) {
    case "SCRIPT_PUBKEY":
      signers.keyHashes.add(script.value.addr_keyhash);
      return;
    case "SCRIPT_ALL":
    case "SCRIPT_ANY":
    case "SCRIPT_N_OF_K":
      script.value.native_scripts.forEach((s) => addNativeScript(signers, s));
      return;
    default:
      return;
  }
};

/** The script of a native witness, read from its reference output when it is held there */
const nativeScriptOf = (
  source: NativeScriptSource,
): NativeScriptPrototype | undefined => {
  if (source.type === "attached") return source.script as NativeScriptPrototype;
  const scriptRef = source.utxo?.output.scriptRef;
  const native = scriptRef && Script.fromCbor(HexBlob(scriptRef)).asNative();
  return native
    ? nativeScriptToPrototype(fromNativeScript(native) as NativeScript)
    : undefined;
};

const addWitness = (
  signers: Signers,
  witness: KeyWitness | NativeWitness | PlutusWitness | { type: "none" },
  credential?: Readonly<CredTypePrototype>,
) => {
  if (witness.type === "key") addCredential(signers, credential);
  if (witness.type === "native") {
    const script = nativeScriptOf(witness.script);
    // Every key a native script names may be needed to satisfy it
    if (script) addNativeScript(signers, script);
  }
};

/** The keys a certificate is signed with, when it is witnessed by keys */
const certificateKeys = (
  signers: Signers,
  certificate: CertificatePart["certificate"],
) => {
  switch (certificate.type) {
    case "POOL_REGISTRATION":
      signers.keyHashes.add(certificate.value.pool_params.operator);
      certificate.value.pool_params.pool_owners.forEach((owner) =>
        signers.keyHashes.add(owner),
      );
      return;
    case "POOL_RETIREMENT":
      signers.keyHashes.add(certificate.value.pool_keyhash);
      return;
    case "COMMITTEE_HOT_AUTH":
    case "COMMITTEE_COLD_RESIGN":
      addCredential(signers, certificate.value.committee_cold_credential);
      return;
    case "DREP_REGISTRATION":
    case "DREP_DEREGISTRATION":
    case "DREP_UPDATE":
      addCredential(signers, certificate.value.voting_credential);
      return;
    default:
      addCredential(signers, certificate.value.stake_credential);
  }
};

/**
 * Everyone who has to sign a transaction made of these (resolved) parts. Native scripts count
 * every key they name, as which of them sign is not known in advance; the fee is then enough for
 * any of them.
 */
export const requiredSigners = (parts: readonly TxPart[]): Signers => {
  const signers: Signers = { keyHashes: new Set(), byronAddresses: new Set() };
  for (const part of parts) {
    switch (part.kind) {
      case "spend":
        if (part.witness.type === "key") addAddress(signers, part.utxo);
        else addWitness(signers, part.witness);
        break;
      case "collateral":
        addAddress(signers, part.utxo);
        break;
      case "requiredSigner":
        signers.keyHashes.add(part.keyHash);
        break;
      case "mint":
        addWitness(signers, part.witness);
        break;
      case "withdrawal": {
        const credential = Address.fromString(part.rewardAddress)
          ?.asReward()
          ?.getPaymentCredential();
        addWitness(
          signers,
          part.witness,
          credential && {
            type: credential.type === CredentialType.KeyHash ? "KEY" : "SCRIPT",
            value: credential.hash.toString(),
          },
        );
        break;
      }
      case "certificate":
        if (part.witness.type === "key")
          certificateKeys(signers, part.certificate);
        else addWitness(signers, part.witness);
        break;
      case "vote":
        if (part.witness.type === "key") {
          if (part.voter.type === "STAKING_POOL")
            signers.keyHashes.add(part.voter.value);
          else addCredential(signers, part.voter.value);
        } else addWitness(signers, part.witness);
        break;
      case "proposal":
        addWitness(signers, part.witness);
        break;
      default:
        break;
    }
  }
  return signers;
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
