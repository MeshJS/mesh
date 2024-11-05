import {
  builtinByteString,
  outputReference,
  resolveScriptHash,
  serializePlutusScript,
  UTxO,
} from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-csl";

import blueprint from "../aiken-workspace/plutus.json";

export { blueprint };

export type InputUTxO = UTxO["input"];

export type ScriptIndex =
  | "OracleNFT"
  | "OracleValidator"
  | "ContentRegistry"
  | "ContentRefToken"
  | "OwnershipRegistry"
  | "OwnershipRefToken";

export const getScriptCbor = (
  oracleParamUtxo: UTxO["input"],
  scriptIndex: ScriptIndex,
) => {
  const validators = blueprint.validators;
  const oracleNFTCbor = applyParamsToScript(
    validators[4]!.compiledCode,
    [outputReference(oracleParamUtxo.txHash, oracleParamUtxo.outputIndex)],
    "JSON",
  );
  const oracleNFTToParam = builtinByteString(
    resolveScriptHash(oracleNFTCbor, "V3"),
  );
  switch (scriptIndex) {
    case "OracleNFT":
      return oracleNFTCbor;
    case "OracleValidator":
      return applyParamsToScript(validators[6]!.compiledCode, [], "JSON");
    case "ContentRegistry":
      return applyParamsToScript(
        validators[0]!.compiledCode,
        [oracleNFTToParam],
        "JSON",
      );
    case "ContentRefToken":
      return applyParamsToScript(
        validators[2]!.compiledCode,
        [oracleNFTToParam],
        "JSON",
      );
    case "OwnershipRegistry":
      return applyParamsToScript(
        validators[8]!.compiledCode,
        [oracleNFTToParam],
        "JSON",
      );
    case "OwnershipRefToken":
      return applyParamsToScript(
        validators[10]!.compiledCode,
        [oracleNFTToParam],
        "JSON",
      );
  }
};

export const getScriptHash = (
  oracleParamUtxo: UTxO["input"],
  scriptIndex: ScriptIndex,
) => {
  const scriptCbor = getScriptCbor(oracleParamUtxo, scriptIndex);
  return resolveScriptHash(scriptCbor, "V3");
};

export const getScriptInfo = (
  oracleParamUtxo: UTxO["input"],
  stakeCredential?: string,
  networkId = 0,
) => {
  const info = {
    oracleNFT: {
      hash: getScriptHash(oracleParamUtxo, "OracleNFT"),
      cbor: getScriptCbor(oracleParamUtxo, "OracleNFT"),
    },
    oracleValidator: {
      hash: getScriptHash(oracleParamUtxo, "OracleValidator"),
      cbor: getScriptCbor(oracleParamUtxo, "OracleValidator"),
      address: "",
    },
    contentRegistry: {
      hash: getScriptHash(oracleParamUtxo, "ContentRegistry"),
      cbor: getScriptCbor(oracleParamUtxo, "ContentRegistry"),
      address: "",
    },
    contentRefToken: {
      hash: getScriptHash(oracleParamUtxo, "ContentRefToken"),
      cbor: getScriptCbor(oracleParamUtxo, "ContentRefToken"),
    },
    ownershipRegistry: {
      hash: getScriptHash(oracleParamUtxo, "OwnershipRegistry"),
      cbor: getScriptCbor(oracleParamUtxo, "OwnershipRegistry"),
      address: "",
    },
    ownershipRefToken: {
      hash: getScriptHash(oracleParamUtxo, "OwnershipRefToken"),
      cbor: getScriptCbor(oracleParamUtxo, "OwnershipRefToken"),
    },
  };

  const oracleAddress = serializePlutusScript(
    { code: info.oracleValidator.cbor, version: "V3" },
    stakeCredential,
    networkId,
  ).address;
  const contentRegistryAddress = serializePlutusScript(
    { code: info.contentRegistry.cbor, version: "V3" },
    stakeCredential,
    networkId,
  ).address;
  const ownershipRegistryAddress = serializePlutusScript(
    { code: info.ownershipRegistry.cbor, version: "V3" },
    stakeCredential,
    networkId,
  ).address;
  info.oracleValidator.address = oracleAddress;
  info.contentRegistry.address = contentRegistryAddress;
  info.ownershipRegistry.address = ownershipRegistryAddress;

  return info;
};
