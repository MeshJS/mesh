// Use `import type` for scalus types, `require()` at runtime since scalus is CJS
import type { Scalus, SlotConfig, SubmitResult } from "scalus";
import { bech32 } from "@scure/base";
import cbor from "cbor";
import { Emulator } from "scalus";

import type {
  AccountInfo,
  Action,
  Asset,
  AssetMetadata,
  BlockInfo,
  GovernanceProposalInfo,
  IEvaluator,
  IFetcher,
  IFetcherOptions,
  ISubmitter,
  Protocol,
  TransactionInfo,
  UTxO,
} from "@meshsdk/common";
import {
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
} from "@meshsdk/common";
import { utxosToCborMap } from "@meshsdk/core-cst";

// Scalus is CJS so we use dynamic import at construction time
let ScalusLib: typeof import("scalus") | undefined;

/**
 * Scalus Emulator provider for MeshJS.
 * Implements IFetcher + ISubmitter + IEvaluator backed by a local Scalus Cardano emulator.
 *
 * Usage:
 * ```ts
 * import { ScalusEmulator } from "@meshsdk/provider";
 * import { Emulator, SlotConfig } from "scalus";
 *
 * const emulator = Emulator.withAddresses([aliceAddr], SlotConfig.preview);
 * const provider = new ScalusEmulator(emulator, SlotConfig.preview);
 * const txBuilder = new MeshTxBuilder({ fetcher: provider, submitter: provider, evaluator: provider });
 * ```
 */
export class ScalusEmulator implements IFetcher, ISubmitter, IEvaluator {
  public emulator: Emulator;
  private slotConfig: SlotConfig;
  private protocolParams: Protocol;
  private costModels: number[][];

  constructor(
    initialUtxos: UTxO[],
    slotConfig: SlotConfig,
    options?: {
      protocolParams?: Protocol;
      costModels?: {
        PlutusV1?: number[];
        PlutusV2?: number[];
        PlutusV3?: number[];
      };
    },
  ) {
    this.emulator = new Emulator(
      Buffer.from(utxosToCborMap(initialUtxos), "hex"),
      slotConfig,
    );

    this.slotConfig = slotConfig;
    this.protocolParams =
      options?.protocolParams ?? DEFAULT_PROTOCOL_PARAMETERS;
    this.costModels = [
      options?.costModels?.PlutusV1 ?? DEFAULT_V1_COST_MODEL_LIST,
      options?.costModels?.PlutusV2 ?? DEFAULT_V2_COST_MODEL_LIST,
      options?.costModels?.PlutusV3 ?? DEFAULT_V3_COST_MODEL_LIST,
    ];

    // Eagerly load the scalus module
    if (!ScalusLib) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ScalusLib = require("scalus") as typeof import("scalus");
    }
  }

  // ---------------------------------------------------------------------------
  // IFetcher
  // ---------------------------------------------------------------------------

  async fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    const entries = this.emulator.getUtxosForAddress(address);
    const utxos = entries.map((e) => decodeUtxoEntry(e, address));
    if (asset) {
      return utxos.filter((u) => u.output.amount.some((a) => a.unit === asset));
    }
    return utxos;
  }

  async fetchUTxOs(hash: string, index?: number): Promise<UTxO[]> {
    const allEntries = this.emulator.getAllUtxos();
    const utxos: UTxO[] = [];
    for (const entry of allEntries) {
      const utxo = decodeUtxoEntry(entry);
      if (utxo.input.txHash === hash) {
        if (index === undefined || utxo.input.outputIndex === index) {
          utxos.push(utxo);
        }
      }
    }
    return utxos;
  }

  async fetchProtocolParameters(_epoch: number): Promise<Protocol> {
    return this.protocolParams;
  }

  // --- Unsupported IFetcher methods (emulator doesn't track this data) ---

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
  ): Promise<{ assets: Asset[]; next?: string | number | null }> {
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

  // ---------------------------------------------------------------------------
  // ISubmitter
  // ---------------------------------------------------------------------------

  async submitTx(tx: string): Promise<string> {
    const txBytes = hexToBytes(tx);
    const result: SubmitResult = this.emulator.submitTx(txBytes);
    if (!result.isSuccess) {
      const logs = result.logs?.join("\n") ?? "";
      throw new Error(
        `Transaction rejected: ${result.error}${logs ? `\nLogs:\n${logs}` : ""}`,
      );
    }
    return result.txHash!;
  }

  // ---------------------------------------------------------------------------
  // IEvaluator
  // ---------------------------------------------------------------------------

  async evaluateTx(
    tx: string,
    additionalUtxos?: UTxO[],
  ): Promise<Omit<Action, "data">[]> {
    const txBytes = hexToBytes(tx);

    const utxoMapBytes = this.emulator.getAllUtxos();
    let utxos: UTxO[] = utxoMapBytes.map((e) => decodeUtxoEntry(e));
    if (additionalUtxos) {
      utxos = utxos.concat(additionalUtxos);
    }
    const utxoMapCbor = Buffer.from(utxosToCborMap(utxos), "hex");
    const scalusSlotConfig = new ScalusLib!.SlotConfig(
      this.slotConfig.slotToTime(0),
      0,
      1000,
    );
    let redeemers: Scalus.Redeemer[];
    try {
      redeemers = ScalusLib!.Scalus.evalPlutusScripts(
        txBytes,
        utxoMapCbor,
        scalusSlotConfig,
        this.costModels,
      );
    } catch (error) {
      throw error;
    }

    const tagMap: Record<string, Action["tag"]> = {
      Spend: "SPEND",
      Mint: "MINT",
      Cert: "CERT",
      Reward: "REWARD",
      Voting: "VOTE",
      Proposing: "PROPOSE",
    };

    return redeemers.map(
      (r): Omit<Action, "data"> => ({
        tag: tagMap[r.tag] || "SPEND",
        index: r.index,
        budget: {
          mem: Number(r.budget.memory),
          steps: Number(r.budget.steps),
        },
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// CBOR Decoding Helpers
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes).toString("hex");
}

/**
 * Convert raw Cardano address bytes to bech32 string.
 * Header byte determines address type and network.
 */
function addressBytesToBech32(addrBytes: Uint8Array): string {
  const header = addrBytes[0]!;
  const networkId = header & 0x0f;
  const prefix =
    networkId === 1
      ? "addr" // mainnet
      : "addr_test"; // testnet

  // bech32 encode the full address bytes (header + payload)
  const words = bech32.toWords(addrBytes);
  return bech32.encode(prefix, words, 1023);
}

/**
 * Decode a Cardano CBOR value field into Asset[].
 * Value is either: uint (lovelace only) or [uint, multiasset_map]
 */
function decodeValue(value: unknown): Asset[] {
  if (typeof value === "number" || typeof value === "bigint") {
    return [{ unit: "lovelace", quantity: String(value) }];
  }
  if (Array.isArray(value)) {
    const [lovelace, multiAsset] = value;
    const assets: Asset[] = [{ unit: "lovelace", quantity: String(lovelace) }];
    if (multiAsset instanceof Map) {
      for (const [policyId, assetMap] of multiAsset) {
        const policyHex = bytesToHex(policyId as Uint8Array);
        if (assetMap instanceof Map) {
          for (const [assetName, quantity] of assetMap) {
            const nameHex = bytesToHex(assetName as Uint8Array);
            assets.push({
              unit: policyHex + nameHex,
              quantity: String(quantity),
            });
          }
        }
      }
    }
    return assets;
  }
  return [{ unit: "lovelace", quantity: "0" }];
}

/**
 * Decode a single CBOR-encoded UTxO entry (Map with one key-value pair)
 * from the Scalus emulator into a MeshJS UTxO.
 *
 * @param cborBytes - CBOR encoded Map[TransactionInput, TransactionOutput]
 * @param knownAddress - If provided, skip address decoding (optimization for fetchAddressUTxOs)
 */
function decodeUtxoEntry(cborBytes: Uint8Array, knownAddress?: string): UTxO {
  const decoded = cbor.decode(cborBytes) as Map<unknown, unknown>;
  const entry = Array.from(decoded.entries())[0]!;
  const [txIn, txOut] = entry;

  // Decode TransactionInput: [hash_bytes, index]
  const txInArr = txIn as [Uint8Array, number];
  const txHash = bytesToHex(txInArr[0]);
  const outputIndex = txInArr[1];

  // Decode TransactionOutput (Babbage era uses Map format)
  let address: string;
  let amount: Asset[];
  let dataHash: string | undefined;
  let plutusData: string | undefined;
  let scriptRef: string | undefined;

  if (txOut instanceof Map) {
    // Babbage-era map format: {0: address, 1: value, ?2: datumOption, ?3: scriptRef}
    const addrBytes = txOut.get(0) as Uint8Array;
    address = knownAddress ?? addressBytesToBech32(addrBytes);
    amount = decodeValue(txOut.get(1));

    const datumOption = txOut.get(2);
    if (datumOption != null && Array.isArray(datumOption)) {
      const [tag, datum] = datumOption;
      if (tag === 0) {
        // DatumHash
        dataHash = bytesToHex(datum as Uint8Array);
      } else if (tag === 1) {
        // Inline datum — encode back to CBOR hex
        plutusData = bytesToHex(cbor.encode(datum));
      }
    }

    const scriptRefVal = txOut.get(3);
    if (scriptRefVal != null) {
      // ScriptRef is CBOR-tagged, encode back to hex
      scriptRef = bytesToHex(cbor.encode(scriptRefVal));
    }
  } else if (Array.isArray(txOut)) {
    // Shelley-era array format: [address, value, ?datumHash]
    const addrBytes = txOut[0] as Uint8Array;
    address = knownAddress ?? addressBytesToBech32(addrBytes);
    amount = decodeValue(txOut[1]);
    if (txOut[2]) {
      dataHash = bytesToHex(txOut[2] as Uint8Array);
    }
  } else {
    throw new Error("Unexpected TransactionOutput format");
  }

  return {
    input: { txHash, outputIndex },
    output: {
      address: address!,
      amount,
      dataHash,
      plutusData,
      scriptRef,
    },
  };
}
