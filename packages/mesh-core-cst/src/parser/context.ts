import { Cardano } from "@cardano-sdk/core";
import { HexBlob } from "@cardano-sdk/util";

import {
  LanguageVersion,
  Redeemer as MeshRedeemer,
  ScriptSource,
  SimpleScriptSourceInfo,
  UTxO,
} from "@meshsdk/common";

import {
  Address,
  AddressType,
  CborReader,
  CredentialCore,
  CredentialType,
  NetworkId,
  RedeemerTag,
  Script,
  Transaction,
  TransactionBody,
  TransactionInput,
  TransactionWitnessSet,
  TxCBOR,
} from "../types";
import { toCardanoAddress } from "../utils/converter";

export type ResolvedScript =
  | { kind: "plutus"; version: LanguageVersion; code: string; hash: string }
  | { kind: "native"; code: string; hash: string };

export type ReferenceScript = ResolvedScript & {
  txHash: string;
  txIndex: number;
  /** Size in bytes of the whole `scriptRef` field of the UTxO, as MeshTxBuilder expects it */
  scriptSize: number;
};

export type ScriptWitness = {
  redeemer?: MeshRedeemer;
  plutusSource?: ScriptSource;
  simpleSource?: SimpleScriptSourceInfo;
};

export const utxoKey = (txHash: string, txIndex: number | bigint): string =>
  `${txHash}#${txIndex}`;

/** The order the ledger keeps credentials in: script credentials first, then by hash */
export const compareCredentials = (
  a: CredentialCore,
  b: CredentialCore,
): number => {
  if (a.type !== b.type) return a.type === CredentialType.ScriptHash ? -1 : 1;
  return a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0;
};

export const addressToString = (address: Address): string =>
  address.getType() === AddressType.Byron
    ? address.toBase58()
    : address.toBech32();

export const paymentCredentialOf = (
  address: string,
): CredentialCore | undefined =>
  toCardanoAddress(address).getProps().paymentPart;

/**
 * Decode a UTxO `scriptRef`. Providers hand it over either as the plain `Script` CBOR
 * (`82 0x …`, what `resolveScriptRef` produces) or wrapped in CBOR tag 24 as it appears
 * inside a transaction output (`d818 59…`); both forms are accepted.
 */
export const scriptFromScriptRef = (scriptRef: string): Script => {
  let cbor = HexBlob(scriptRef);
  if (scriptRef.toLowerCase().startsWith("d818")) {
    const reader = new CborReader(cbor);
    reader.readTag();
    cbor = HexBlob(Buffer.from(reader.readByteString()).toString("hex"));
  }
  return Script.fromCbor(cbor);
};

export const toResolvedScript = (script: Script): ResolvedScript => {
  const v3 = script.asPlutusV3();
  if (v3) {
    return {
      kind: "plutus",
      version: "V3",
      code: v3.toCbor().toString(),
      hash: v3.hash().toString(),
    };
  }
  const v2 = script.asPlutusV2();
  if (v2) {
    return {
      kind: "plutus",
      version: "V2",
      code: v2.toCbor().toString(),
      hash: v2.hash().toString(),
    };
  }
  const v1 = script.asPlutusV1();
  if (v1) {
    return {
      kind: "plutus",
      version: "V1",
      code: v1.toCbor().toString(),
      hash: v1.hash().toString(),
    };
  }
  const native = script.asNative();
  if (!native) {
    throw new Error("Unsupported script language in script reference");
  }
  return {
    kind: "native",
    code: native.toCbor().toString(),
    hash: native.hash().toString(),
  };
};

/**
 * Network for credentials rendered as addresses (stake and committee credentials): the
 * body's `networkId` when set, otherwise the first output / withdrawal / collateral
 * return / resolved input address.
 */
const inferNetworkId = (
  body: TransactionBody,
  inputAddress: string | undefined,
): NetworkId => {
  const explicit = body.networkId();
  if (explicit !== undefined) return explicit;
  const firstOutput = body.outputs()[0];
  if (firstOutput) return firstOutput.address().getNetworkId();
  const firstWithdrawal = body.withdrawals()?.keys().next().value;
  if (firstWithdrawal)
    return Cardano.RewardAccount.toNetworkId(firstWithdrawal);
  const collateralReturn = body.collateralReturn();
  if (collateralReturn) return collateralReturn.address().getNetworkId();
  if (inputAddress) return toCardanoAddress(inputAddress).getNetworkId();
  return Cardano.NetworkId.Mainnet;
};

/** Shared indexes of a deserialized transaction: UTxOs, scripts, redeemers, witness datums */
export class TxParserContext {
  readonly tx: Transaction;
  readonly body: TransactionBody;
  readonly witnessSet: TransactionWitnessSet;
  readonly networkId: NetworkId;

  private readonly utxos = new Map<string, UTxO>();
  private readonly witnessScripts = new Map<string, ResolvedScript>();
  private readonly referenceScripts = new Map<string, ReferenceScript>();
  private readonly redeemers = new Map<string, MeshRedeemer>();
  private readonly witnessDatums = new Map<string, string>();
  private readonly inputDatumHashes = new Set<string>();

  constructor(txHex: string, resolvedUtxos: UTxO[]) {
    this.tx = Transaction.fromCbor(TxCBOR(txHex));
    this.body = this.tx.body();
    this.witnessSet = this.tx.witnessSet();
    for (const utxo of resolvedUtxos) {
      this.utxos.set(utxoKey(utxo.input.txHash, utxo.input.outputIndex), utxo);
    }
    this.networkId = inferNetworkId(this.body, this.firstInputAddress());

    this.indexWitnessScripts();
    this.indexReferenceScripts();
    this.indexRedeemers();
    this.indexWitnessDatums();
    this.indexInputDatums();
  }

  getUtxo(txHash: string, txIndex: number): UTxO | undefined {
    return this.utxos.get(utxoKey(txHash, txIndex));
  }

  requireUtxo(txHash: string, txIndex: number, role: string): UTxO {
    const utxo = this.getUtxo(txHash, txIndex);
    if (!utxo) {
      throw new Error(
        `Cannot parse transaction: the ${role} UTxO ${txHash}#${txIndex} was not found in the resolved UTxOs`,
      );
    }
    return utxo;
  }

  getRedeemer(tag: RedeemerTag, index: number): MeshRedeemer | undefined {
    return this.redeemers.get(`${tag}:${index}`);
  }

  getWitnessDatum(dataHash: string): string | undefined {
    return this.witnessDatums.get(dataHash);
  }

  /** Whether a spent input already supplies the datum of this hash through the witness set */
  isDatumProvidedByInput(dataHash: string): boolean {
    return this.inputDatumHashes.has(dataHash);
  }

  /** Provided in the witness set, else referenced from the `scriptRef` of a resolved input */
  resolvePlutusScriptSource(scriptHash: string): ScriptSource | undefined {
    const witness = this.witnessScripts.get(scriptHash);
    if (witness?.kind === "plutus") {
      return {
        type: "Provided",
        script: { code: witness.code, version: witness.version },
      };
    }
    const reference = this.referenceScripts.get(scriptHash);
    if (reference?.kind === "plutus") {
      return {
        type: "Inline",
        txHash: reference.txHash,
        txIndex: reference.txIndex,
        scriptHash,
        version: reference.version,
        scriptSize: reference.scriptSize.toString(),
      };
    }
    return undefined;
  }

  resolveSimpleScriptSource(
    scriptHash: string,
  ): SimpleScriptSourceInfo | undefined {
    const witness = this.witnessScripts.get(scriptHash);
    if (witness?.kind === "native") {
      return { type: "Provided", scriptCode: witness.code };
    }
    const reference = this.referenceScripts.get(scriptHash);
    if (reference?.kind === "native") {
      return {
        type: "Inline",
        txHash: reference.txHash,
        txIndex: reference.txIndex,
        simpleScriptHash: scriptHash,
        scriptSize: reference.scriptSize.toString(),
      };
    }
    return undefined;
  }

  /** How the script of `credential` is witnessed at redeemer (`tag`, `index`); empty for keys */
  scriptWitnessFor(
    credential: CredentialCore | undefined,
    tag: RedeemerTag,
    index: number,
  ): ScriptWitness {
    if (!credential || credential.type !== CredentialType.ScriptHash) {
      return {};
    }
    const scriptHash = credential.hash.toString();
    const witness: ScriptWitness = {};
    const redeemer = this.getRedeemer(tag, index);
    if (redeemer) witness.redeemer = redeemer;
    const plutusSource = this.resolvePlutusScriptSource(scriptHash);
    if (plutusSource) witness.plutusSource = plutusSource;
    const simpleSource = this.resolveSimpleScriptSource(scriptHash);
    if (simpleSource) witness.simpleSource = simpleSource;
    return witness;
  }

  private indexWitnessScripts() {
    const register = (
      version: LanguageVersion | undefined,
      scripts:
        | readonly {
            hash(): { toString(): string };
            toCbor(): { toString(): string };
          }[]
        | undefined,
    ) => {
      for (const script of scripts ?? []) {
        const hash = script.hash().toString();
        const code = script.toCbor().toString();
        this.witnessScripts.set(
          hash,
          version
            ? { kind: "plutus", version, code, hash }
            : { kind: "native", code, hash },
        );
      }
    };
    register(undefined, this.witnessSet.nativeScripts()?.values());
    register("V1", this.witnessSet.plutusV1Scripts()?.values());
    register("V2", this.witnessSet.plutusV2Scripts()?.values());
    register("V3", this.witnessSet.plutusV3Scripts()?.values());
  }

  private indexReferenceScripts() {
    const register = (input: TransactionInput) => {
      const txHash = input.transactionId().toString();
      const txIndex = Number(input.index());
      const scriptRef = this.getUtxo(txHash, txIndex)?.output.scriptRef;
      if (!scriptRef) return;
      let resolved: ResolvedScript;
      try {
        resolved = toResolvedScript(scriptFromScriptRef(scriptRef));
      } catch (error) {
        throw new Error(
          `Cannot parse transaction: invalid scriptRef on UTxO ${txHash}#${txIndex}: ${error}`,
        );
      }
      if (!this.referenceScripts.has(resolved.hash)) {
        this.referenceScripts.set(resolved.hash, {
          ...resolved,
          txHash,
          txIndex,
          scriptSize: scriptRef.length / 2,
        });
      }
    };
    // Reference inputs are the conventional place for reference scripts; the ledger also
    // accepts scripts carried by spent inputs, so those are indexed with lower priority.
    this.body.referenceInputs()?.values().forEach(register);
    this.body.inputs().values().forEach(register);
  }

  private indexRedeemers() {
    for (const redeemer of this.witnessSet.redeemers()?.values() ?? []) {
      this.redeemers.set(`${redeemer.tag()}:${redeemer.index()}`, {
        data: { type: "CBOR", content: redeemer.data().toCbor().toString() },
        exUnits: {
          mem: Number(redeemer.exUnits().mem()),
          steps: Number(redeemer.exUnits().steps()),
        },
      });
    }
  }

  private indexWitnessDatums() {
    for (const datum of this.witnessSet.plutusData()?.values() ?? []) {
      this.witnessDatums.set(
        datum.hash().toString(),
        datum.toCbor().toString(),
      );
    }
  }

  private indexInputDatums() {
    for (const input of this.body.inputs().values()) {
      const output = this.getUtxo(
        input.transactionId().toString(),
        Number(input.index()),
      )?.output;
      if (
        output?.dataHash &&
        !output.plutusData &&
        this.witnessDatums.has(output.dataHash)
      ) {
        this.inputDatumHashes.add(output.dataHash);
      }
    }
  }

  private firstInputAddress(): string | undefined {
    for (const input of this.body.inputs().values()) {
      const utxo = this.getUtxo(
        input.transactionId().toString(),
        Number(input.index()),
      );
      if (utxo) return utxo.output.address;
    }
    return undefined;
  }
}
