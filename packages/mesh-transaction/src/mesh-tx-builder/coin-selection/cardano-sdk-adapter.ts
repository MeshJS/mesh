import CardanoSelection from '@cardano-sdk/input-selection';
import {Cardano as CSDK, Serialization} from "@cardano-sdk/core";
import {HexBlob} from "@cardano-sdk/util"
import {
    BuilderCallbacks,
    IInputSelector,
    ImplicitValue,
    TransactionPrototype
} from "./coin-selection-interface"
import {Asset, Output, TxIn, TxOutput, UTxO} from "@meshsdk/common";
import {
    fromBuilderToPlutusData,
    Hash32ByteBase16,
    PlutusV1Script, PlutusV2Script, PlutusV3Script, Script,
    TokenMap,
} from "@meshsdk/core-cst";

const signalDataHash = <Hash32ByteBase16>"BEEFBEEFBEEFBEEFBEEFBEEFBEEFBEEFBEEFBEEFBEEFBEEFBEEFBEEFBEEFBEEF"
const signalAddress = "01beffbeffbeffbeffbeffbeffbeffbeffbeffbeffbeffbeffbeffbeefbeffbeffbeffbeffbeffbeffbeffbeffbeffbeffbeffbeffbeffbeef"

export class BuilderCallbacksSdkBridge implements CardanoSelection.SelectionConstraints {

    private readonly builderCallback: BuilderCallbacks;
    private readonly utxoMap = new Map<string, UTxO>();
    private readonly usedUtxos = new Set<string>();

    constructor(builderCallbacks: BuilderCallbacks, utxoMap: Map<string, UTxO>, usedUtxos: Set<string>) {
        this.builderCallback = builderCallbacks;
        this.utxoMap = utxoMap;
        this.usedUtxos = usedUtxos;
    }

    computeMinimumCoinQuantity(output: CSDK.TxOut): CSDK.Lovelace {
        return this.builderCallback.computeMinimumCoinQuantity(
            CSDKOutputToMeshOutput(output)
        )
    }

    async computeMinimumCost(selectionSkeleton: CardanoSelection.SelectionSkeleton): Promise<CardanoSelection.TxCosts> {
        const minFee = await this.builderCallback.computeMinimumCost({
            new_inputs: this.getNewInputs(selectionSkeleton),
            new_outputs: new Set<TxOutput>(),
            change: selectionSkeleton.change.map(output => CSDKOutputToMeshOutput(output)),
            fee: selectionSkeleton.fee
        });

        return {
            fee: minFee
        }
    }

    computeSelectionLimit(selectionSkeleton: CardanoSelection.SelectionSkeleton): Promise<number> {
        return this.builderCallback.computeSelectionLimit({
            new_inputs: this.getNewInputs(selectionSkeleton),
            new_outputs: new Set<TxOutput>(),
            change: selectionSkeleton.change.map(output => CSDKOutputToMeshOutput(output)),
            fee: selectionSkeleton.fee
        });
    }

    tokenBundleSizeExceedsLimit(tokenBundle: TokenMap | undefined): boolean {
        return this.builderCallback.tokenBundleSizeExceedsLimit(CSDKTokenMapToMeshAssets(tokenBundle));
    }

    getNewInputs(selectionSkeleton: CardanoSelection.SelectionSkeleton): Set<UTxO> {
        const new_inputs = new Set<UTxO>();
        for (const input of selectionSkeleton.inputs) {
            const utxoId = `${input[0].txId}#${input[0].index}`;
            if (this.usedUtxos.has(utxoId)) {
                continue;
            }
            const original_utxo = this.utxoMap.get(utxoId);
            if (original_utxo == null) {
                throw new Error("Missing required utxo");
            } else {
                new_inputs.add(original_utxo);
            }
        }
        return new_inputs;
    }
}

export class CardanoSdkInputSelector implements IInputSelector {
    private readonly constraints: BuilderCallbacks;

    constructor(constraints: BuilderCallbacks) {
        this.constraints = constraints;
    }

    async select(preselectedUtoxs: TxIn[], outputs: Output[], implicitValue: ImplicitValue, utxos: UTxO[], changeAddress: string): Promise<TransactionPrototype> {
        const utxoMap = new Map<string, UTxO>();
        for (const utxo of utxos) {
            utxoMap.set(`${utxo.input.txHash}#${utxo.input.outputIndex}`, utxo);
        }
        const aggregatedTxOut = makeAggregatedCSDKOOutput(outputs);
        const preselectedUtoxsCSDK = new Set(preselectedUtoxs.map(meshTxInToCSDKUtxo));
        const utxoxCSDK = utxos.map(meshUtxoToCSDKUtxo);

        const selector = CardanoSelection.roundRobinRandomImprove({
            changeAddressResolver: new StaticChangeAddressResolver(changeAddress)
        });
        const usedUtxos = new Set<string>();
        for (const utxo of preselectedUtoxs) {
            usedUtxos.add(`${utxo.txIn.txHash}#${utxo.txIn.txIndex}`);
        }
        const builderCallbacksBridge = new BuilderCallbacksSdkBridge(this.constraints, utxoMap, usedUtxos);
        const selectResult = await selector.select({
            preSelectedUtxo: preselectedUtoxsCSDK,
            utxo: new Set(utxoxCSDK),
            outputs: new Set([aggregatedTxOut]),
            constraints: builderCallbacksBridge,
            implicitValue: meshImplicitCoinToCSDKImplicitCoins(implicitValue),
        });

        const new_inputs = new Set<UTxO>();
        for (const input of selectResult.selection.inputs) {
            const utxoId = `${input[0].txId}#${input[0].index}`;
            if (!usedUtxos.has(utxoId)) {
                const original_utxo = utxoMap.get(utxoId);
                if (original_utxo == null) {
                    throw new Error("Missing required utxo");
                } else {
                    new_inputs.add(original_utxo);
                }
            }
        }

        return {
            new_inputs: new_inputs,
            new_outputs: new Set(),
            change: selectResult.selection.change.map(CSDKOutputToMeshOutput),
            fee: selectResult.selection.fee,
        };
    }
}

export class StaticChangeAddressResolver implements CardanoSelection.ChangeAddressResolver {
    readonly changeAddress: string;

    constructor(changeAddress: string) {
        this.changeAddress = changeAddress;
    }

    async resolve(selection: CardanoSelection.Selection): Promise<Array<CSDK.TxOut>> {
        return selection.change.map((txOut) => ({
            ...txOut,
            address: <CSDK.PaymentAddress>this.changeAddress
            }));
    }
}

const meshTxInToCSDKUtxo = (txIn: TxIn): CSDK.Utxo => {
    return [
        {
            txId: <CSDK.TransactionId> txIn.txIn.txHash,
            index: txIn.txIn.txIndex,
            address: <CSDK.PaymentAddress>txIn.txIn.address,
        },
        {
            address: <CSDK.PaymentAddress>txIn.txIn.address,
            value: meshAssetsToCSDKValue(txIn.txIn.amount),
        }
    ]
}

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
            scriptReference: meshScriptReferenceToCSDKScriptReference(utxo.output.scriptRef),
        }
    ]
}

const meshScriptReferenceToCSDKScriptReference = (scriptReference?: string): CSDK.Script | undefined => {
    if (scriptReference == null) {
        return undefined;
    }

    return Serialization.Script.fromCbor(<HexBlob>scriptReference).toCore();
}

const meshDatumToCSDKDatum = (datum?: string): CSDK.PlutusData | undefined => {
    if (datum == null) {
        return undefined;
    }

    return Serialization.PlutusData.fromCbor(<HexBlob>datum).toCore();
}

const meshDataHashToCSDKDataHash = (hash?: string): CSDK.DatumHash | undefined => {
    if (hash == null) {
        return undefined;
    }
    return <CSDK.DatumHash>hash;
}

const meshAssetsToCSDKValue = (assets?: Asset[]): CSDK.Value => {
    if (assets == null) {
        throw new Error("Missing required assets. Be sure that you resolve all required utxos");
    }

    let lovelace = 0n;
    let sdkAssets = new Map<CSDK.AssetId, bigint>();
    for (const asset of assets) {
        if (asset.unit === 'lovelace' || asset.unit === '') {
            lovelace = BigInt(asset.quantity);
        } else {
            const assetId = <CSDK.AssetId>asset.unit;
            sdkAssets.set(assetId, BigInt(asset.quantity));
        }
    }
    if (sdkAssets.size === 0) {
        return {
            coins: lovelace,
        }
    }
    return {
        coins: lovelace,
        assets: sdkAssets,
    }
}

const meshAssetsToCSDKAssets = (assets?: Asset[]): CSDK.TokenMap | undefined => {
    if (assets == null) {
        return undefined;
    }

    let sdkAssets = new Map<CSDK.AssetId, bigint>();
    for (const asset of assets) {
        if (asset.unit === 'lovelace' || asset.unit === '') {
            throw new Error("Unexpected lovelace asset in assets");
        } else {
            const assetId = <CSDK.AssetId>asset.unit;
            sdkAssets.set(assetId, BigInt(asset.quantity));
        }
    }
    return sdkAssets;
}

const CSDKOutputToMeshOutput = (output: CSDK.TxOut): TxOutput => {
    const amount = CSDKValueToMeshAssets(output.value);
    return {
        address: output.address,
        amount: amount,
    }
}

const CSDKValueToMeshAssets = (value: CSDK.Value): Asset[] => {
    let assets: Asset[] = [];
    if (value.coins !== 0n) {
        assets.push({
            unit: '',
            quantity: value.coins.toString()
        });
    }
    if (value.assets) {
        for (const [assetId, quantity] of value.assets) {
            assets.push({
                unit: assetId,
                quantity: quantity.toString()
            });
        }
    }
    return assets;
}

const CSDKTokenMapToMeshAssets = (tokenMap?: CSDK.TokenMap): Asset[] | undefined => {
    if (tokenMap == null) {
        return undefined;
    }
    let assets: Asset[] = [];
    for (const [assetId, quantity] of tokenMap) {
        assets.push({
            unit: assetId,
            quantity: quantity.toString()
        });
    }
    return assets;
}

const meshOutputToCSDKOutput = (output: Output): CSDK.TxOut => {
    const {
       dataHash,
       datum,
       scriptReference
    } = meshOutputToCSDKOutputsScriptData(output)
    return {
        address: <CSDK.PaymentAddress> output.address,
        value: meshAssetsToCSDKValue(output.amount),
        datumHash: dataHash,
        datum: datum,
        scriptReference: scriptReference,
    }
}

const makeAggregatedCSDKOOutput = (outputs: Output[]): CSDK.TxOut => {
    let totalAssets = new Map<string, bigint>
    for(const output of outputs) {
        totalAssets = sumAssets(totalAssets, output.amount);
    }

    return {
        address: <CSDK.PaymentAddress> signalAddress,
        value: assetsMapToCSDKValue(totalAssets),
        datumHash: signalDataHash,
    }
}

const meshOutputToCSDKOutputsScriptData  = (output: Output): {
    dataHash?: CSDK.DatumHash,
    datum?: CSDK.PlutusData,
    scriptReference?: CSDK.Script;
} => {
    let dataHash: CSDK.DatumHash | undefined  = undefined;
    let datum: CSDK.PlutusData | undefined = undefined;
    let scriptReference: CSDK.Script| undefined;
    if (output.datum?.type === "Hash") {
        dataHash =  meshDataHashToCSDKDataHash(
            HexBlob(
                fromBuilderToPlutusData(output.datum.data).hash()
            )
        );
    } else if (output.datum?.type === "Inline") {
        datum = meshDatumToCSDKDatum(fromBuilderToPlutusData(output.datum.data).toCbor());
    } else if (output.datum?.type === "Embedded") {
        throw new Error("Embedded datum is not supported")
    }
    let meshCoreScript = undefined;
    if (output.referenceScript) {
        switch (output.referenceScript.version) {
            case "V1": {
                meshCoreScript =
                    Script.newPlutusV1Script(
                        PlutusV1Script.fromCbor(HexBlob(output.referenceScript.code)),
                    );
                break;
            }
            case "V2": {
                meshCoreScript =
                    Script.newPlutusV2Script(
                        PlutusV2Script.fromCbor(HexBlob(output.referenceScript.code)),
                    );
                break;
            }
            case "V3": {
                meshCoreScript =
                    Script.newPlutusV3Script(
                        PlutusV3Script.fromCbor(HexBlob(output.referenceScript.code)),
                );
                break;
            }
        }
    }

    scriptReference = meshScriptReferenceToCSDKScriptReference(meshCoreScript?.toCbor());
    return {
        dataHash,
        datum,
        scriptReference
    };
};

const assetsMapToCSDKValue = (assets: Map<string, bigint>): CSDK.Value => {
    let lovelace = 0n;
    let sdkAssets = new Map<CSDK.AssetId, bigint>();
    for (const [unit, quantity] of assets) {
        if (unit === 'lovelace' || unit === '') {
            lovelace = BigInt(quantity);
        } else {
            const assetId = <CSDK.AssetId>unit;
            sdkAssets.set(assetId, BigInt(quantity));
        }
    }
    if (sdkAssets.size === 0) {
        return {
            coins: lovelace,
        }
    }
    return {
        coins: lovelace,
        assets: sdkAssets,
    }
}

const assetsToCSDKImplicitValue = (assets?: Asset[]): CardanoSelection.ImplicitValue | undefined => {
    if (assets == null || assets.length === 0) {
        return undefined;
    }
    const value = meshAssetsToCSDKValue(assets);
    return {

    }
}

const sumAssets = (a: Map<string, bigint>, b: Asset[]): Map<string, bigint> => {
    for (const asset of b) {
        let currentAmount = a.get(asset.unit) ?? 0n;
        currentAmount += BigInt(asset.quantity);
        a.set(asset.unit, currentAmount);
    }
    return a;
}

const meshImplicitCoinToCSDKImplicitCoins = (implicitCoins?: ImplicitValue): CardanoSelection.ImplicitValue | undefined => {
   if (implicitCoins == null) {
       return undefined;
   }
   const mint = meshAssetsToCSDKAssets(implicitCoins.mint);
   const totalInput = implicitCoins.deposit + implicitCoins.withdrawals;
   const CSKDImplicitCoin = {
       withdrawals: implicitCoins.withdrawals,
       input: totalInput,
       deposit: implicitCoins.deposit,
       reclaimDeposit: implicitCoins.reclaimDeposit,
   }

   return {
       coin: CSKDImplicitCoin,
       mint: mint,
   }
}
