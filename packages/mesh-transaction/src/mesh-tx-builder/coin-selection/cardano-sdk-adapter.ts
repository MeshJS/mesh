import { Cardano as CSDK, Serialization } from "@cardano-sdk/core";
import * as CardanoSelection from "@cardano-sdk/input-selection";
import { HexBlob } from "@cardano-sdk/util";

import {
  Action,
  Asset,
  Output,
  RedeemerTagType,
  TxIn,
  TxOutput,
  UTxO,
} from "@meshsdk/common";
import {
  fromBuilderToPlutusData,
  PlutusV1Script,
  PlutusV2Script,
  PlutusV3Script,
  Script,
  TokenMap,
} from "@meshsdk/core-cst";

import {
  BuilderCallbacks,
  IInputSelector,
  ImplicitValue,
  TransactionPrototype,
} from "./coin-selection-interface";

// Fake address used for temporary outputs during coin selection
const FAKE_ADDRESS =
  "01beffbeffbeffbeffbeffbeffbeffbeffbeffbeffbeffbeffbeffbeefbeffbeffbeffbeffbeffbeffbeffbeffbeffbeffbeffbeffbeffbeef";

export class BuilderCallbacksSdkBridge
  implements CardanoSelection.SelectionConstraints
{
  private readonly builderCallback: BuilderCallbacks;
  private readonly utxoMap: Map<string, UTxO>;
  private readonly usedUtxos: Set<string>;

  constructor(
    builderCallbacks: BuilderCallbacks,
    utxoMap: Map<string, UTxO>,
    usedUtxos: Set<string>,
  ) {
    this.builderCallback = builderCallbacks;
    this.utxoMap = utxoMap;
    this.usedUtxos = usedUtxos;
  }

  computeMinimumCoinQuantity = (output: CSDK.TxOut): CSDK.Lovelace => {
    return this.builderCallback.computeMinimumCoinQuantity(
      CSDKOutputToMeshOutput(output),
    );
  };

  computeMinimumCost = async (
    selectionSkeleton: CardanoSelection.SelectionSkeleton,
  ): Promise<CardanoSelection.TxCosts> => {
    const costs = await this.builderCallback.computeMinimumCost({
      newInputs: this.getNewInputs(selectionSkeleton),
      newOutputs: new Set<TxOutput>(),
      change: selectionSkeleton.change.map((output) =>
        CSDKOutputToMeshOutput(output),
      ),
      fee: selectionSkeleton.fee,
    });

    return {
      fee: costs.fee,
      redeemers: costs.redeemers?.map(meshActionToCSDKRedeemer),
    };
  };

  computeSelectionLimit = async (
    selectionSkeleton: CardanoSelection.SelectionSkeleton,
  ): Promise<number> => {
    const maxSizeExceed = await this.builderCallback.maxSizeExceed({
      newInputs: this.getNewInputs(selectionSkeleton),
      newOutputs: new Set<TxOutput>(),
      change: selectionSkeleton.change.map((output) =>
        CSDKOutputToMeshOutput(output),
      ),
      fee: selectionSkeleton.fee,
    });

    return maxSizeExceed
      ? selectionSkeleton.inputs.size - 1
      : selectionSkeleton.inputs.size + 1;
  };

  tokenBundleSizeExceedsLimit = (
    tokenBundle: TokenMap | undefined,
  ): boolean => {
    return this.builderCallback.tokenBundleSizeExceedsLimit(
      CSDKTokenMapToMeshAssets(tokenBundle),
    );
  };

  getNewInputs = (
    selectionSkeleton: CardanoSelection.SelectionSkeleton,
  ): Set<UTxO> => {
    const newInputs = new Set<UTxO>();

    for (const input of selectionSkeleton.inputs) {
      const utxoId = `${input[0].txId}#${input[0].index}`;

      if (this.usedUtxos.has(utxoId)) {
        continue;
      }

      const originalUtxo = this.utxoMap.get(utxoId);
      if (!originalUtxo) {
        throw new Error(`Missing required UTxO: ${utxoId}`);
      }

      newInputs.add(originalUtxo);
    }

    return newInputs;
  };
}

export class CardanoSdkInputSelector implements IInputSelector {
  private readonly constraints: BuilderCallbacks;

  constructor(constraints: BuilderCallbacks) {
    this.constraints = constraints;
  }

  async select(
    preselectedUtxos: TxIn[],
    outputs: Output[],
    implicitValue: ImplicitValue,
    utxos: UTxO[],
    changeAddress: string,
  ): Promise<TransactionPrototype> {
    // Create a map of UTxOs for quick lookup
    const utxoMap = new Map<string, UTxO>();
    for (const utxo of utxos) {
      utxoMap.set(`${utxo.input.txHash}#${utxo.input.outputIndex}`, utxo);
    }

    // Aggregate outputs into a single output for selection
    const aggregatedTxOut = makeAggregatedCSDKOOutput(outputs);
    const aggregatedOuts = new Set<CSDK.TxOut>();
    if (aggregatedTxOut) {
      aggregatedOuts.add(aggregatedTxOut);
    }
    // Convert Mesh types to CSDK types
    const preselectedUtoxsCSDK = new Set(
      preselectedUtxos.map(meshTxInToCSDKUtxo),
    );
    const utxoxCSDK = utxos.map(meshUtxoToCSDKUtxo);

    // Create selector with change address resolver
    const selector = CardanoSelection.roundRobinRandomImprove({
      changeAddressResolver: new StaticChangeAddressResolver(changeAddress),
    });

    // Track used UTxOs
    const usedUtxos = new Set<string>();
    for (const utxo of preselectedUtxos) {
      usedUtxos.add(`${utxo.txIn.txHash}#${utxo.txIn.txIndex}`);
    }
    // Create bridge for callbacks
    const builderCallbacksBridge = new BuilderCallbacksSdkBridge(
      this.constraints,
      utxoMap,
      usedUtxos,
    );

    // Perform selection
    const selectResult = await selector.select({
      preSelectedUtxo: preselectedUtoxsCSDK,
      utxo: new Set(utxoxCSDK),
      outputs: aggregatedOuts,
      constraints: builderCallbacksBridge,
      implicitValue: meshImplicitCoinToCSDKImplicitCoins(implicitValue),
    });
    // Extract newly selected inputs
    const newInputs = new Set<UTxO>();
    for (const input of selectResult.selection.inputs) {
      const utxoId = `${input[0].txId}#${input[0].index}`;
      if (!usedUtxos.has(utxoId)) {
        const originalUtxo = utxoMap.get(utxoId);
        if (!originalUtxo) {
          throw new Error(`Missing required UTxO: ${utxoId}`);
        }
        newInputs.add(originalUtxo);
      }
    }

    // Return transaction prototype
    return {
      newInputs,
      newOutputs: new Set(),
      change: selectResult.selection.change.map(CSDKOutputToMeshOutput),
      fee: selectResult.selection.fee,
      redeemers: selectResult.redeemers?.map(CSDKRedeemerToMeshAction),
    };
  }
}

export class StaticChangeAddressResolver
  implements CardanoSelection.ChangeAddressResolver
{
  readonly changeAddress: string;

  constructor(changeAddress: string) {
    this.changeAddress = changeAddress;
  }

  resolve = async (
    selection: CardanoSelection.Selection,
  ): Promise<Array<CSDK.TxOut>> => {
    return selection.change.map((txOut) => ({
      ...txOut,
      address: <CSDK.PaymentAddress>this.changeAddress,
    }));
  };
}

const meshTxInToCSDKUtxo = (txIn: TxIn): CSDK.Utxo => {
  return [
    {
      txId: <CSDK.TransactionId>txIn.txIn.txHash,
      index: txIn.txIn.txIndex,
      address: <CSDK.PaymentAddress>txIn.txIn.address,
    },
    {
      address: <CSDK.PaymentAddress>txIn.txIn.address,
      value: meshAssetsToCSDKValue(txIn.txIn.amount),
    },
  ];
};

const meshUtxoToCSDKUtxo = (utxo: UTxO): CSDK.Utxo => {
  return [
    {
      txId: <CSDK.TransactionId>utxo.input.txHash,
      index: utxo.input.outputIndex,
      address: <CSDK.PaymentAddress>utxo.output.address,
    },
    {
      address: <CSDK.PaymentAddress>utxo.output.address,
      value: meshAssetsToCSDKValue(utxo.output.amount),
      datumHash: meshDataHashToCSDKDataHash(utxo.output.dataHash),
      datum: meshDatumToCSDKDatum(utxo.output.plutusData),
      scriptReference: meshScriptReferenceToCSDKScriptReference(
        utxo.output.scriptRef,
      ),
    },
  ];
};

const meshScriptReferenceToCSDKScriptReference = (
  scriptReference?: string,
): CSDK.Script | undefined => {
  if (!scriptReference) {
    return undefined;
  }

  return Serialization.Script.fromCbor(<HexBlob>scriptReference).toCore();
};

const meshDatumToCSDKDatum = (datum?: string): CSDK.PlutusData | undefined => {
  if (!datum) {
    return undefined;
  }

  return Serialization.PlutusData.fromCbor(<HexBlob>datum).toCore();
};

const meshDataHashToCSDKDataHash = (
  hash?: string,
): CSDK.DatumHash | undefined => {
  if (!hash) {
    return undefined;
  }
  return <CSDK.DatumHash>hash;
};

const meshAssetsToCSDKValue = (assets?: Asset[]): CSDK.Value => {
  if (!assets) {
    throw new Error(
      "Missing required assets. Be sure that you resolve all required UTxOs",
    );
  }

  let lovelace = 0n;
  const sdkAssets = new Map<CSDK.AssetId, bigint>();

  for (const asset of assets) {
    if (asset.unit === "lovelace" || asset.unit === "") {
      lovelace = BigInt(asset.quantity);
    } else {
      const assetId = <CSDK.AssetId>asset.unit;
      sdkAssets.set(assetId, BigInt(asset.quantity));
    }
  }

  if (sdkAssets.size === 0) {
    return { coins: lovelace };
  }

  return {
    coins: lovelace,
    assets: sdkAssets,
  };
};

const meshAssetsToCSDKAssets = (
  assets?: Asset[],
): CSDK.TokenMap | undefined => {
  if (!assets) {
    return undefined;
  }

  const sdkAssets = new Map<CSDK.AssetId, bigint>();

  for (const asset of assets) {
    if (asset.unit === "lovelace" || asset.unit === "") {
      throw new Error("Unexpected lovelace asset in assets");
    } else {
      const assetId = <CSDK.AssetId>asset.unit;
      sdkAssets.set(assetId, BigInt(asset.quantity));
    }
  }

  return sdkAssets;
};

const CSDKOutputToMeshOutput = (output: CSDK.TxOut): TxOutput => {
  const amount = CSDKValueToMeshAssets(output.value);
  return {
    address: output.address,
    amount: amount,
  };
};

const CSDKValueToMeshAssets = (value: CSDK.Value): Asset[] => {
  const assets: Asset[] = [];

  if (value.coins !== 0n) {
    assets.push({
      unit: "lovelace",
      quantity: value.coins.toString(),
    });
  }

  if (value.assets) {
    for (const [assetId, quantity] of value.assets) {
      assets.push({
        unit: assetId,
        quantity: quantity.toString(),
      });
    }
  }

  return assets;
};

const CSDKTokenMapToMeshAssets = (
  tokenMap?: CSDK.TokenMap,
): Asset[] | undefined => {
  if (!tokenMap) {
    return undefined;
  }

  const assets: Asset[] = [];

  for (const [assetId, quantity] of tokenMap) {
    assets.push({
      unit: assetId,
      quantity: quantity.toString(),
    });
  }

  return assets;
};

const meshOutputToCSDKOutput = (output: Output): CSDK.TxOut => {
  const { dataHash, datum, scriptReference } =
    meshOutputToCSDKOutputsScriptData(output);

  return {
    address: <CSDK.PaymentAddress>output.address,
    value: meshAssetsToCSDKValue(output.amount),
    datumHash: dataHash,
    datum: datum,
    scriptReference: scriptReference,
  };
};

const makeAggregatedCSDKOOutput = (
  outputs: Output[],
): CSDK.TxOut | undefined => {
  let totalAssets = new Map<string, bigint>();

  for (const output of outputs) {
    totalAssets = sumAssets(totalAssets, output.amount);
  }

  if (totalAssets.size === 0) {
    return undefined;
  }

  return {
    address: <CSDK.PaymentAddress>FAKE_ADDRESS,
    value: assetsMapToCSDKValue(totalAssets),
  };
};

const meshOutputToCSDKOutputsScriptData = (
  output: Output,
): {
  dataHash?: CSDK.DatumHash;
  datum?: CSDK.PlutusData;
  scriptReference?: CSDK.Script;
} => {
  let dataHash: CSDK.DatumHash | undefined = undefined;
  let datum: CSDK.PlutusData | undefined = undefined;
  let scriptReference: CSDK.Script | undefined;

  if (output.datum?.type === "Hash") {
    dataHash = meshDataHashToCSDKDataHash(
      HexBlob(fromBuilderToPlutusData(output.datum.data).hash()),
    );
  } else if (output.datum?.type === "Inline") {
    datum = meshDatumToCSDKDatum(
      fromBuilderToPlutusData(output.datum.data).toCbor(),
    );
  } else if (output.datum?.type === "Embedded") {
    throw new Error("Embedded datum is not supported");
  }

  let meshCoreScript = undefined;
  if (output.referenceScript) {
    switch (output.referenceScript.version) {
      case "V1": {
        meshCoreScript = Script.newPlutusV1Script(
          PlutusV1Script.fromCbor(HexBlob(output.referenceScript.code)),
        );
        break;
      }
      case "V2": {
        meshCoreScript = Script.newPlutusV2Script(
          PlutusV2Script.fromCbor(HexBlob(output.referenceScript.code)),
        );
        break;
      }
      case "V3": {
        meshCoreScript = Script.newPlutusV3Script(
          PlutusV3Script.fromCbor(HexBlob(output.referenceScript.code)),
        );
        break;
      }
    }
  }

  scriptReference = meshScriptReferenceToCSDKScriptReference(
    meshCoreScript?.toCbor(),
  );

  return {
    dataHash,
    datum,
    scriptReference,
  };
};

const assetsMapToCSDKValue = (assets: Map<string, bigint>): CSDK.Value => {
  let lovelace = 0n;
  const sdkAssets = new Map<CSDK.AssetId, bigint>();

  for (const [unit, quantity] of assets) {
    if (unit === "lovelace" || unit === "") {
      lovelace = BigInt(quantity);
    } else {
      const assetId = <CSDK.AssetId>unit;
      sdkAssets.set(assetId, BigInt(quantity));
    }
  }

  if (sdkAssets.size === 0) {
    return { coins: lovelace };
  }

  return {
    coins: lovelace,
    assets: sdkAssets,
  };
};

const sumAssets = (a: Map<string, bigint>, b: Asset[]): Map<string, bigint> => {
  for (const asset of b) {
    const currentAmount = a.get(asset.unit) ?? 0n;
    a.set(asset.unit, currentAmount + BigInt(asset.quantity));
  }
  return a;
};

const meshImplicitCoinToCSDKImplicitCoins = (
  implicitCoins?: ImplicitValue,
): CardanoSelection.ImplicitValue | undefined => {
  if (!implicitCoins) {
    return undefined;
  }
  const mint = meshAssetsToCSDKAssets(implicitCoins.mint);
  const totalInput = implicitCoins.reclaimDeposit + implicitCoins.withdrawals;
  const CSKDImplicitCoin = {
    withdrawals: implicitCoins.withdrawals,
    input: totalInput,
    deposit: implicitCoins.deposit,
    reclaimDeposit: implicitCoins.reclaimDeposit,
  };

  return {
    coin: CSKDImplicitCoin,
    mint: mint,
  };
};

const meshActionToCSDKRedeemer = (
  action: Omit<Action, "data">,
): CSDK.Redeemer => {
  return {
    purpose: meshRedeemerTagToCSDKRedeemerTag(action.tag),
    index: action.index,
    executionUnits: {
      steps: action.budget.steps,
      memory: action.budget.mem,
    },
    data: 0n,
  };
};

const CSDKRedeemerToMeshAction = (
  redeemer: CSDK.Redeemer,
): Omit<Action, "data"> => {
  return {
    tag: CSDKRedeemerTagToMeshRedeemerTag(redeemer.purpose),
    index: redeemer.index,
    budget: {
      steps: redeemer.executionUnits.steps,
      mem: redeemer.executionUnits.memory,
    },
  };
};

const meshRedeemerTagToCSDKRedeemerTag = (
  tag: RedeemerTagType,
): CSDK.RedeemerPurpose => {
  switch (tag) {
    case "SPEND":
      return CSDK.RedeemerPurpose.spend;
    case "MINT":
      return CSDK.RedeemerPurpose.mint;
    case "CERT":
      return CSDK.RedeemerPurpose.certificate;
    case "REWARD":
      return CSDK.RedeemerPurpose.withdrawal;
    case "PROPOSE":
      return CSDK.RedeemerPurpose.propose;
    case "VOTE":
      return CSDK.RedeemerPurpose.vote;
  }
};

const CSDKRedeemerTagToMeshRedeemerTag = (
  tag: CSDK.RedeemerPurpose,
): RedeemerTagType => {
  switch (tag) {
    case CSDK.RedeemerPurpose.spend:
      return "SPEND";
    case CSDK.RedeemerPurpose.mint:
      return "MINT";
    case CSDK.RedeemerPurpose.certificate:
      return "CERT";
    case CSDK.RedeemerPurpose.withdrawal:
      return "REWARD";
    case CSDK.RedeemerPurpose.propose:
      return "PROPOSE";
    case CSDK.RedeemerPurpose.vote:
      return "VOTE";
  }
};
