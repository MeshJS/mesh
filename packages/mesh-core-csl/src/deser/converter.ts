/* eslint-disable consistent-return */
/* eslint-disable default-case */
import JSONbig from "json-bigint";

import type {
  Asset,
  BuilderData,
  Data,
  NativeScript,
  PlutusScript,
} from "@meshsdk/common";

// import { LANGUAGE_VERSIONS } from ".";
import { csl } from "./csl";
import {
  deserializeEd25519KeyHash,
  deserializePlutusScript,
  // deserializePlutusScript,
} from "./deserializer";

/* -----------------[ Address ]----------------- */

export const toAddress = (bech32: string) => csl.Address.from_bech32(bech32);

export const toBaseAddress = (bech32: string) =>
  csl.BaseAddress.from_address(toAddress(bech32));

export const toEnterpriseAddress = (bech32: string) =>
  csl.EnterpriseAddress.from_address(toAddress(bech32));

export const toRewardAddress = (bech32: string) =>
  csl.RewardAddress.from_address(toAddress(bech32));

/* -----------------[ Bytes ]----------------- */

export const fromBytes = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString("hex");

export const toBytes = (hex: string): Uint8Array => {
  if (hex.length % 2 === 0 && /^[0-9A-F]*$/i.test(hex))
    return Buffer.from(hex, "hex");

  return Buffer.from(hex, "utf-8");
};

/* -----------------[ UTF-8 ]----------------- */

export const fromUTF8 = (utf8: string) => {
  if (utf8.length % 2 === 0 && /^[0-9A-F]*$/i.test(utf8)) return utf8;

  return fromBytes(Buffer.from(utf8, "utf-8"));
};

export const toUTF8 = (hex: string) =>
  Buffer.from(hex, "hex").toString("utf-8");

/* -----------------[ Lovelace ]----------------- */

export const fromLovelace = (lovelace: number) => lovelace / 1_000_000;

export const toLovelace = (ada: number) => ada * 1_000_000;

// /* -----------------[ NativeScript ]----------------- */

// export const fromNativeScript = (script: csl.NativeScript) => {
//   const fromNativeScripts = (scripts: csl.NativeScripts) => {
//     const nativeScripts = new Array<NativeScript>();

//     for (let index = 0; index < scripts.len(); index += 1) {
//       nativeScripts.push(fromNativeScript(scripts.get(index)));
//     }

//     return nativeScripts;
//   };

//   switch (script.kind()) {
//     case csl.NativeScriptKind.ScriptAll: {
//       const scriptAll = script.as_script_all()!;
//       return <NativeScript>{
//         type: "all",
//         scripts: fromNativeScripts(scriptAll.native_scripts()),
//       };
//     }
//     case csl.NativeScriptKind.ScriptAny: {
//       const scriptAny = script.as_script_any()!;
//       return <NativeScript>{
//         type: "any",
//         scripts: fromNativeScripts(scriptAny.native_scripts()),
//       };
//     }
//     case csl.NativeScriptKind.ScriptNOfK: {
//       const scriptNOfK = script.as_script_n_of_k()!;
//       return <NativeScript>{
//         type: "atLeast",
//         required: scriptNOfK.n(),
//         scripts: fromNativeScripts(scriptNOfK.native_scripts()),
//       };
//     }
//     case csl.NativeScriptKind.TimelockStart: {
//       const timelockStart = script.as_timelock_start()!;
//       return <NativeScript>{
//         type: "after",
//         slot: timelockStart.slot_bignum().to_str(),
//       };
//     }
//     case csl.NativeScriptKind.TimelockExpiry: {
//       const timelockExpiry = script.as_timelock_expiry()!;
//       return <NativeScript>{
//         type: "before",
//         slot: timelockExpiry.slot_bignum().to_str(),
//       };
//     }
//     case csl.NativeScriptKind.ScriptPubkey: {
//       const scriptPubkey = script.as_script_pubkey()!;
//       return <NativeScript>{
//         type: "sig",
//         keyHash: scriptPubkey.addr_keyhash().to_hex(),
//       };
//     }
//     default:
//       throw new Error(`Script Kind: ${script.kind()}, is not supported`);
//   }
// };

// /* -----------------[ Scripts ]----------------- */
// export const fromScriptRef = (
//   scriptRef: string,
// ): PlutusScript | NativeScript | undefined => {
//   const script = csl.ScriptRef.from_hex(scriptRef);
//   if (script.is_plutus_script()) {
//     const plutusScript = script.plutus_script()!;

//     return <PlutusScript>{
//       code: plutusScript.to_hex(),
//       version: Object.keys(LANGUAGE_VERSIONS).find(
//         (key) =>
//           LANGUAGE_VERSIONS[key as LanguageVersion].to_hex() ===
//           plutusScript.language_version().to_hex(),
//       ),
//     };
//   }

//   const nativeScript = script.native_script()!;

//   return fromNativeScript(nativeScript);
// };

export const toScriptRef = (script: PlutusScript | NativeScript) => {
  if ("code" in script) {
    const plutusScript = deserializePlutusScript(script.code, script.version);

    return csl.ScriptRef.new_plutus_script(plutusScript);
  }

  return csl.ScriptRef.new_native_script(toNativeScript(script));
};

/* -----------------[ PlutusData ]----------------- */

export const toPlutusData = (data: Data): csl.PlutusData => {
  const toPlutusList = (dataArray: Data[]) => {
    const plutusList = csl.PlutusList.new();
    dataArray.forEach((element) => {
      plutusList.add(toPlutusData(element));
    });

    return plutusList;
  };

  switch (typeof data) {
    case "string":
      return csl.PlutusData.new_bytes(toBytes(data));
    case "number":
      return csl.PlutusData.new_integer(csl.BigInt.from_str(data.toString()));
    case "bigint":
      return csl.PlutusData.new_integer(csl.BigInt.from_str(data.toString()));
    case "object":
      if (data instanceof Array) {
        const plutusList = toPlutusList(data);
        return csl.PlutusData.new_list(plutusList);
      }
      if (data instanceof Map) {
        const plutusMap = csl.PlutusMap.new();
        data.forEach((value, key) => {
          const plutusMapValue = csl.PlutusMapValues.new();
          plutusMapValue.add(toPlutusData(value));
          plutusMap.insert(toPlutusData(key), plutusMapValue);
        });
        return csl.PlutusData.new_map(plutusMap);
      }
      return csl.PlutusData.new_constr_plutus_data(
        csl.ConstrPlutusData.new(
          csl.BigNum.from_str(data.alternative.toString()),
          toPlutusList(data.fields),
        ),
      );
  }
};

export const castRawDataToJsonString = (rawData: object | string) => {
  if (typeof rawData === "object") {
    return JSONbig.stringify(rawData);
  }
  return rawData as string;
};

export const castDataToPlutusData = ({
  type,
  content,
}: BuilderData): csl.PlutusData => {
  if (type === "Mesh") {
    return toPlutusData(content);
  }
  if (type === "CBOR") {
    return csl.PlutusData.from_hex(content as string);
  }
  return csl.PlutusData.from_json(
    castRawDataToJsonString(content),
    csl.PlutusDatumSchema.DetailedSchema,
  );
};

export const toNativeScript = (script: NativeScript) => {
  const toNativeScripts = (scripts: NativeScript[]) => {
    const nativeScripts = csl.NativeScripts.new();

    scripts.forEach((script) => {
      nativeScripts.add(toNativeScript(script));
    });

    return nativeScripts;
  };

  switch (script.type) {
    case "all":
      return csl.NativeScript.new_script_all(
        csl.ScriptAll.new(toNativeScripts(script.scripts)),
      );
    case "any":
      return csl.NativeScript.new_script_any(
        csl.ScriptAny.new(toNativeScripts(script.scripts)),
      );
    case "atLeast":
      return csl.NativeScript.new_script_n_of_k(
        csl.ScriptNOfK.new(script.required, toNativeScripts(script.scripts)),
      );
    case "after":
      return csl.NativeScript.new_timelock_start(
        csl.TimelockStart.new_timelockstart(csl.BigNum.from_str(script.slot)),
      );
    case "before":
      return csl.NativeScript.new_timelock_expiry(
        csl.TimelockExpiry.new_timelockexpiry(csl.BigNum.from_str(script.slot)),
      );
    case "sig":
      return csl.NativeScript.new_script_pubkey(
        csl.ScriptPubkey.new(deserializeEd25519KeyHash(script.keyHash)),
      );
  }
};

export const toCslValue = (assets: Asset[]): csl.Value => {
  let cslValue: csl.Value | undefined = undefined;
  let multiAsset: csl.MultiAsset = csl.MultiAsset.new();
  for (const asset of assets) {
    if (asset.unit === "lovelace" || asset.unit === "") {
      cslValue = csl.Value.new(csl.BigNum.from_str(asset.quantity));
    } else {
      const policyId = csl.ScriptHash.from_hex(asset.unit.slice(0, 56));
      const assetName = csl.AssetName.new(
        Buffer.from(asset.unit.slice(56), "hex"),
      );
      const quantity = csl.BigNum.from_str(asset.quantity);
      multiAsset.set_asset(policyId, assetName, quantity);
    }
  }
  if (cslValue !== undefined) {
    cslValue.set_multiasset(multiAsset);
  } else {
    cslValue = csl.Value.new(csl.BigNum.from_str("0"));
    cslValue.set_multiasset(multiAsset);
  }
  return cslValue;
};
