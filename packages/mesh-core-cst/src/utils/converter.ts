import { Serialization } from "@cardano-sdk/core";
import { Ed25519KeyHash } from "@cardano-sdk/crypto";
import { HexBlob } from "@cardano-sdk/util";

import {
  Asset,
  Data,
  NativeScript,
  PlutusScript,
  Quantity,
  toBytes,
  Unit,
  UTxO,
} from "@meshsdk/common";

import {
  Address,
  AssetId,
  BaseAddress,
  ConstrPlutusData,
  NativeScript as CstNativeScript,
  Datum,
  EnterpriseAddress,
  PlutusData,
  PlutusList,
  PlutusMap,
  PlutusV1Script,
  PlutusV2Script,
  PlutusV3Script,
  RequireAllOf,
  RequireAnyOf,
  RequireNOf,
  RequireSignature,
  RequireTimeAfter,
  RequireTimeBefore,
  RewardAddress,
  Script,
  Slot,
  TokenMap,
  TransactionInput,
  TransactionOutput,
  TransactionUnspentOutput,
  Value,
} from "../types";
import {
  deserializeDataHash,
  deserializePlutusData,
  deserializePlutusScript,
  deserializeScriptRef,
  deserializeTxHash,
} from "./deserializer";

export const toAddress = (bech32: string): Address =>
  Address.fromBech32(bech32);

export const toBaseAddress = (bech32: string): BaseAddress | undefined => {
  return BaseAddress.fromAddress(toAddress(bech32));
};

export const toEnterpriseAddress = (
  bech32: string,
): EnterpriseAddress | undefined => {
  return EnterpriseAddress.fromAddress(toAddress(bech32));
};

export const toRewardAddress = (bech32: string): RewardAddress | undefined =>
  RewardAddress.fromAddress(toAddress(bech32));

export const fromTxUnspentOutput = (
  txUnspentOutput: TransactionUnspentOutput,
): UTxO => {
  const dataHash = txUnspentOutput.output().datum()
    ? txUnspentOutput.output().datum()?.toCbor().toString()
    : undefined;

  const scriptRef = txUnspentOutput.output().scriptRef()
    ? txUnspentOutput.output().scriptRef()?.toCbor().toString()
    : undefined;

  const plutusData = txUnspentOutput.output().datum()?.asInlineData()
    ? txUnspentOutput.output().datum()?.asInlineData()?.toCbor().toString()
    : undefined;

  return <UTxO>{
    input: {
      outputIndex: Number(txUnspentOutput.input().index()),
      txHash: txUnspentOutput.input().transactionId(),
    },
    output: {
      address: txUnspentOutput.output().address().toBech32(),
      amount: fromValue(txUnspentOutput.output().amount()),
      dataHash: dataHash, // todo not sure if correct
      plutusData: plutusData, // todo not sure if correct
      scriptRef: scriptRef, // todo not sure if correct
    },
  };
};

export const toTxUnspentOutput = (utxo: UTxO) => {
  const txInput = new TransactionInput(
    deserializeTxHash(utxo.input.txHash),
    BigInt(utxo.input.outputIndex),
  );

  const txOutput = new TransactionOutput(
    toAddress(utxo.output.address),
    toValue(utxo.output.amount),
  );

  if (utxo.output.dataHash !== undefined) {
    txOutput.setDatum(
      Datum.fromCore(deserializeDataHash(utxo.output.dataHash)),
    );
  }

  if (utxo.output.plutusData !== undefined) {
    const plutusData = deserializePlutusData(utxo.output.plutusData);
    const datum = new Serialization.Datum(undefined, plutusData);
    txOutput.setDatum(datum);
  }

  if (utxo.output.scriptRef !== undefined) {
    txOutput.setScriptRef(deserializeScriptRef(utxo.output.scriptRef));
  }

  return new TransactionUnspentOutput(txInput, txOutput);
};

export const addressToBech32 = (address: Address): string => {
  return address.toBech32();
};

export const fromValue = (value: Value) => {
  const assets: Asset[] = [
    { unit: "lovelace", quantity: value.coin().toString() },
  ];

  const multiAsset = value.multiasset();
  if (multiAsset !== undefined) {
    const _assets = Array.from(multiAsset.keys());
    for (let i = 0; i < _assets.length; i += 1) {
      const assetId = _assets[i];
      if (assetId !== undefined) {
        const assetQuantity = multiAsset.get(assetId);
        if (assetQuantity !== undefined) {
          assets.push({
            unit: assetId as Unit,
            quantity: assetQuantity.toString() as Quantity,
          });
        }
      }
    }
  }

  return assets;
};

export const toScriptRef = (script: PlutusScript | NativeScript): Script => {
  if ("code" in script) {
    const plutusScript = deserializePlutusScript(script.code, script.version);
    if (plutusScript instanceof PlutusV1Script)
      return Script.newPlutusV1Script(plutusScript);
    if (plutusScript instanceof PlutusV2Script)
      return Script.newPlutusV2Script(plutusScript);
    if (plutusScript instanceof PlutusV3Script)
      return Script.newPlutusV3Script(plutusScript);
  }
  return Script.newNativeScript(toNativeScript(script as NativeScript));
};

export const fromScriptRef = (
  scriptRef: string,
): PlutusScript | NativeScript | undefined => {
  const script = Script.fromCbor(HexBlob(scriptRef));

  const plutusScriptCodeV3 = script.asPlutusV3()?.toCbor().toString();
  if (plutusScriptCodeV3) {
    return {
      code: plutusScriptCodeV3,
      version: "V3",
    };
  }

  const plutusScriptCodeV2 = script.asPlutusV2()?.toCbor().toString();
  if (plutusScriptCodeV2) {
    return {
      code: plutusScriptCodeV2,
      version: "V2",
    };
  }

  const plutusScriptCodeV1 = script.asPlutusV1()?.toCbor().toString();
  if (plutusScriptCodeV1) {
    return {
      code: plutusScriptCodeV1,
      version: "V1",
    };
  }

  // TODO: implement from native script
  const nativeScript = script.asNative();
  if (!nativeScript) {
    throw new Error("Invalid script");
  }

  return fromNativeScript(nativeScript);
};

export const fromNativeScript = (script: CstNativeScript) => {
  const fromNativeScripts = (scripts: CstNativeScript[]) => {
    const nativeScripts = new Array<NativeScript>();

    for (let index = 0; index < scripts.length; index += 1) {
      const script = scripts[index];
      if (script) {
        nativeScripts.push(fromNativeScript(script));
      }
    }

    return nativeScripts;
  };

  switch (script.kind()) {
    case RequireAllOf: {
      const scriptAll = script.asScriptAll()!;
      return <NativeScript>{
        type: "all",
        scripts: fromNativeScripts(scriptAll.nativeScripts()),
      };
    }
    case RequireAnyOf: {
      const scriptAny = script.asScriptAny()!;
      return <NativeScript>{
        type: "any",
        scripts: fromNativeScripts(scriptAny.nativeScripts()),
      };
    }
    case RequireNOf: {
      const scriptNOfK = script.asScriptNOfK()!;
      return <NativeScript>{
        type: "atLeast",
        required: scriptNOfK.required(),
        scripts: fromNativeScripts(scriptNOfK.nativeScripts()),
      };
    }
    case RequireTimeAfter: {
      const timelockStart = script.asTimelockStart()!;
      return <NativeScript>{
        type: "after",
        slot: timelockStart.slot().toString(),
      };
    }
    case RequireTimeBefore: {
      const timelockExpiry = script.asTimelockExpiry()!;
      return <NativeScript>{
        type: "before",
        slot: timelockExpiry.slot().toString(),
      };
    }
    case RequireSignature: {
      const scriptPubkey = script.asScriptPubkey()!;
      return <NativeScript>{
        type: "sig",
        keyHash: scriptPubkey.keyHash().toString(),
      };
    }
    default:
      throw new Error(`Script Kind: ${script.kind()}, is not supported`);
  }
};

export const toNativeScript = (script: NativeScript) => {
  const toNativeScripts = (scripts: NativeScript[]) => {
    const nativeScripts: CstNativeScript[] = [];

    scripts.forEach((script) => {
      nativeScripts.push(toNativeScript(script));
    });

    return nativeScripts;
  };

  switch (script.type) {
    case "all":
      return CstNativeScript.newScriptAll(
        new Serialization.ScriptAll(toNativeScripts(script.scripts)),
      );
    case "any":
      return CstNativeScript.newScriptAny(
        new Serialization.ScriptAny(toNativeScripts(script.scripts)),
      );
    case "atLeast":
      return CstNativeScript.newScriptNOfK(
        new Serialization.ScriptNOfK(
          toNativeScripts(script.scripts),
          script.required,
        ),
      );
    case "after":
      return CstNativeScript.newTimelockStart(
        new Serialization.TimelockStart(Slot(parseInt(script.slot))),
      );
    case "before":
      return CstNativeScript.newTimelockExpiry(
        new Serialization.TimelockExpiry(Slot(parseInt(script.slot))),
      );
    case "sig":
      return CstNativeScript.newScriptPubkey(
        new Serialization.ScriptPubkey(
          Ed25519KeyHash.fromBytes(toBytes(script.keyHash)).hex(),
        ),
      );
  }
};

export const toPlutusData = (data: Data): PlutusData => {
  const toPlutusList = (data: Data[]) => {
    const plutusList = new PlutusList();
    data.forEach((element) => {
      plutusList.add(toPlutusData(element));
    });
    return plutusList;
  };

  switch (typeof data) {
    case "string":
      return PlutusData.newBytes(toBytes(data));
    case "number":
      return PlutusData.newInteger(BigInt(data));
    case "bigint":
      return PlutusData.newInteger(BigInt(data));
    case "object":
      if (data instanceof Array) {
        const plutusList = toPlutusList(data);
        return PlutusData.newList(plutusList);
      } else if (data instanceof Map) {
        const plutusMap = new PlutusMap();
        data.forEach((value, key) => {
          plutusMap.insert(toPlutusData(key), toPlutusData(value));
        });
        return PlutusData.newMap(plutusMap);
      } else {
        return PlutusData.newConstrPlutusData(
          new ConstrPlutusData(
            BigInt(data.alternative),
            toPlutusList(data.fields),
          ),
        );
      }
  }
};

export const toValue = (assets: Asset[]) => {
  const multiAsset: TokenMap = new Map();
  assets
    .filter((asset) => asset.unit !== "lovelace")
    .forEach((asset) => {
      multiAsset.set(AssetId(asset.unit), BigInt(asset.quantity));
    });

  const lovelace = assets.find((asset) => asset.unit === "lovelace");
  const value = new Value(BigInt(lovelace ? lovelace.quantity : 0));

  if (assets.length > 1 || !lovelace) {
    value.setMultiasset(multiAsset);
  }

  return value;
};
