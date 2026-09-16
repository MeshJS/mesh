import type { CardanoInfo, Emulator, RedeemerBudget, Utxo } from "scalus";

import type {
  AccountInfo,
  Action,
  AssetMetadata,
  BlockInfo,
  GovernanceProposalInfo,
  IEvaluator,
  IFetcher,
  IFetcherOptions,
  ISubmitter,
  Asset as MeshAsset,
  UTxO as MeshUTxO,
  Protocol,
  RedeemerTagType,
  TransactionInfo,
} from "@meshsdk/common";
import { castProtocol } from "@meshsdk/common";
import {
  CborReader,
  CborWriter,
  getTransactionOutputs,
  resolveDataHash,
} from "@meshsdk/core-cst";

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex))
    throw new Error("Invalid hexadecimal CBOR");
  return Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function toScalusScriptRef(scriptRef: string): Uint8Array {
  const writer = new CborWriter();
  writer.writeTag(24);
  writer.writeByteString(hexToBytes(scriptRef));
  return writer.encode();
}

function toMeshScriptRef(scriptRef: Uint8Array): string {
  const reader = new CborReader(scriptRef);
  if (Number(reader.readTag()) !== 24)
    throw new Error("Invalid Scalus reference script: expected CBOR tag 24");
  return bytesToHex(reader.readByteString());
}

/**
 * `"Spend"` and friends, as mesh spells them. Keying this on Scalus's own union makes a tag
 * added upstream a compile error here rather than a runtime throw.
 */
const MESH_TAG: Record<RedeemerBudget["tag"], RedeemerTagType> = {
  Spend: "SPEND",
  Mint: "MINT",
  Cert: "CERT",
  Reward: "REWARD",
  Voting: "VOTE",
  Proposing: "PROPOSE",
};

function toMeshUtxo(utxo: Utxo): MeshUTxO {
  const amount: MeshAsset[] = [
    { unit: "lovelace", quantity: utxo.value.coin.toString() },
    ...utxo.value.assets.map((a) => ({
      unit: a.unit,
      quantity: a.quantity.toString(),
    })),
  ];
  return {
    input: { txHash: utxo.txHash, outputIndex: utxo.outputIndex },
    output: {
      address: utxo.address,
      amount,
      dataHash: utxo.datumHash,
      plutusData: utxo.inlineDatum && bytesToHex(utxo.inlineDatum),
      scriptRef: utxo.scriptRef && toMeshScriptRef(utxo.scriptRef),
    },
  };
}

function fromMeshUtxo(utxo: MeshUTxO, lib: typeof import("scalus")): Utxo {
  const { Asset, Utxo, Value } = lib;
  const lovelace = utxo.output.amount.find((a) => a.unit === "lovelace");
  const assets = utxo.output.amount
    .filter((a) => a.unit !== "lovelace")
    .map(
      (a) =>
        new Asset(a.unit.slice(0, 56), a.unit.slice(56), BigInt(a.quantity)),
    );
  const value = new Value(BigInt(lovelace?.quantity ?? "0"), assets);
  const { dataHash, plutusData, scriptRef } = utxo.output;
  if (
    dataHash &&
    plutusData &&
    dataHash !== resolveDataHash(plutusData, "CBOR")
  )
    throw new Error("a UTxO's datum hash does not match its inline datum");
  const base = new Utxo(
    utxo.input.txHash,
    utxo.input.outputIndex,
    utxo.output.address,
    value,
  );
  // Neither the datum nor the reference script may be dropped here. An inline datum is how a
  // script UTxO carries its state, so an input that reaches `evaluateTx` without it builds a
  // script context that is missing it - a wrong budget, or a phase-2 failure that reads like a
  // validator bug.
  const withDatum = plutusData
    ? base.withInlineDatum(hexToBytes(plutusData))
    : dataHash
      ? base.withDatumHash(dataHash)
      : base;
  return scriptRef
    ? withDatum.withScriptRef(toScalusScriptRef(scriptRef))
    : withDatum;
}

export class ScalusEmulator implements IFetcher, ISubmitter, IEvaluator {
  constructor(readonly emulator: Emulator) {}

  /** Create a provider without synchronously loading the ESM-only Scalus package. */
  static async create(
    initialUtxos: MeshUTxO[] = [],
    info?: CardanoInfo,
  ): Promise<ScalusEmulator> {
    const lib = await import("scalus");
    const emulator = lib.Emulator.create(info ?? lib.CardanoInfo.preview());
    for (const utxo of initialUtxos) emulator.addUtxo(fromMeshUtxo(utxo, lib));
    return new ScalusEmulator(emulator);
  }

  async setSlot(slot: number): Promise<void> {
    this.emulator.setSlot(slot);
  }

  async fetchProtocolParameters(epoch = 0): Promise<Protocol> {
    const p = this.emulator.getProtocolParameters();
    // `castProtocol` fills in the parameters a transaction build never reads (block sizes,
    // decentralisation, min pool cost) from mesh's own defaults.
    return castProtocol({
      epoch,
      minFeeA: p.txFeePerByte,
      minFeeB: p.txFeeFixed,
      maxTxSize: p.maxTxSize,
      maxValSize: p.maxValueSize,
      keyDeposit: p.stakeAddressDeposit.toString(),
      poolDeposit: p.stakePoolDeposit.toString(),
      coinsPerUtxoSize: Number(p.utxoCostPerByte),
      priceMem: p.priceMemory,
      priceStep: p.priceSteps,
      maxTxExMem: p.maxTxExecutionMemory.toString(),
      maxTxExSteps: p.maxTxExecutionSteps.toString(),
      collateralPercent: p.collateralPercentage,
      maxCollateralInputs: p.maxCollateralInputs,
      minFeeRefScriptCostPerByte: p.minFeeRefScriptCostPerByte,
    });
  }

  async fetchAddressUTxOs(
    address: string,
    asset?: string,
  ): Promise<MeshUTxO[]> {
    const filter = asset === undefined ? { address } : { address, unit: asset };
    return this.emulator.getUtxos(filter).map(toMeshUtxo);
  }

  async fetchUTxOs(hash: string, index?: number): Promise<MeshUTxO[]> {
    const utxos = this.emulator.getUtxos({ txHash: hash });
    const matching =
      index === undefined
        ? utxos
        : utxos.filter((u) => u.outputIndex === index);
    return matching.map(toMeshUtxo);
  }

  async submitTx(txHex: string): Promise<string> {
    const result = this.emulator.submitTx(hexToBytes(txHex));
    if (!result.isSuccess) {
      throw new Error(
        `${result.errorRule}: ${result.error} ${result.logs.join(" ")}`,
      );
    }
    return result.txHash!;
  }

  async evaluateTx(
    txHex: string,
    additionalUtxos: MeshUTxO[] = [],
    additionalTxs: string[] = [],
  ): Promise<Omit<Action, "data">[]> {
    const lib = await import("scalus");
    const pendingOutputs = additionalTxs.flatMap(getTransactionOutputs);
    const budgets = this.emulator.evaluateTx(
      hexToBytes(txHex),
      [...additionalUtxos, ...pendingOutputs].map((u) => fromMeshUtxo(u, lib)),
    );
    return budgets.map((r) => {
      const tag = MESH_TAG[r.tag];
      if (!tag) throw new Error(`Unknown redeemer tag: ${r.tag}`);
      return {
        tag,
        index: r.index,
        budget: { mem: Number(r.budget.memory), steps: Number(r.budget.steps) },
      };
    });
  }

  async fetchCostModels(_epoch?: number): Promise<number[][]> {
    const { PlutusV1, PlutusV2, PlutusV3 } =
      this.emulator.getProtocolParameters().costModels;
    return [PlutusV1, PlutusV2, PlutusV3];
  }

  // Explorer/history queries are outside the emulator provider surface.
  async fetchAccountInfo(_address: string): Promise<AccountInfo> {
    throw new Error("fetchAccountInfo not supported by ScalusEmulator");
  }

  async fetchAddressTxs(
    _address: string,
    _options?: IFetcherOptions,
  ): Promise<TransactionInfo[]> {
    throw new Error("fetchAddressTxs not supported by ScalusEmulator");
  }

  async fetchAssetAddresses(
    _asset: string,
  ): Promise<{ address: string; quantity: string }[]> {
    throw new Error("fetchAssetAddresses not supported by ScalusEmulator");
  }

  async fetchAssetMetadata(_asset: string): Promise<AssetMetadata> {
    throw new Error("fetchAssetMetadata not supported by ScalusEmulator");
  }

  async fetchBlockInfo(_hash: string): Promise<BlockInfo> {
    throw new Error("fetchBlockInfo not supported by ScalusEmulator");
  }

  async fetchCollectionAssets(
    _policyId: string,
    _cursor?: number | string,
  ): Promise<{ assets: MeshAsset[]; next?: string | number | null }> {
    throw new Error("fetchCollectionAssets not supported by ScalusEmulator");
  }

  async fetchTxInfo(_hash: string): Promise<TransactionInfo> {
    throw new Error("fetchTxInfo not supported by ScalusEmulator");
  }

  async fetchGovernanceProposal(
    _txHash: string,
    _certIndex: number,
  ): Promise<GovernanceProposalInfo> {
    throw new Error("fetchGovernanceProposal not supported by ScalusEmulator");
  }

  async get(_url: string): Promise<any> {
    throw new Error("get not supported by ScalusEmulator");
  }
}
