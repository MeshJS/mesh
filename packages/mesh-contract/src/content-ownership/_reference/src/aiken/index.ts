import { Data } from "@meshsdk/core";
import aikenScripts from "./blueprint.json";
import { C } from "./libs";
import { bytesToHex, hexToBytes } from "@sidan-lab/sidan-csl";

const toBytes = (hex: string): Uint8Array => {
  if (hex.length % 2 === 0 && /^[0-9A-F]*$/i.test(hex)) return Buffer.from(hex, "hex");

  return Buffer.from(hex, "utf-8");
};

export const toPlutusData = (data: Data) => {
  const toPlutusList = (data: Data[]) => {
    const plutusList = C.PlutusList.new();
    data.forEach((element) => {
      plutusList.add(toPlutusData(element));
    });

    return plutusList;
  };

  switch (typeof data) {
    case "string":
      return C.PlutusData.new_bytes(toBytes(data));
    case "number":
      return C.PlutusData.new_integer(C.BigInt.from_str(data.toString()));
    case "object":
      if (data instanceof Array) {
        const plutusList = toPlutusList(data);
        return C.PlutusData.new_list(plutusList);
      } else if (data instanceof Map) {
        const plutusMap = C.PlutusMap.new();
        data.forEach((value, key) => {
          plutusMap.insert(toPlutusData(key), toPlutusData(value));
        });
        return C.PlutusData.new_map(plutusMap);
      } else {
        return C.PlutusData.new_constr_plutus_data(
          C.ConstrPlutusData.new(C.BigNum.from_str(data.alternative.toString()), toPlutusList(data.fields))
        );
      }
  }
};

export function applyDoubleCborEncoding(script: string): string {
  try {
    C.PlutusScript.from_bytes(C.PlutusScript.from_bytes(hexToBytes(script)).bytes());
    return script;
  } catch (_e) {
    return bytesToHex(C.PlutusScript.new(hexToBytes(script)).to_bytes());
  }
}

export type ParamsToApply =
  | {
      type: "Mesh";
      params: Data[];
    }
  | {
      type: "Raw";
      params: object[];
    };

export function applyParamsToScript(plutusScript: string, paramsToApply: ParamsToApply): string {
  const plutusList = C.PlutusList.new();
  const type = paramsToApply.type;
  if (type === "Mesh") {
    paramsToApply.params.forEach((param) => {
      const plutusData = toPlutusData(param);
      plutusList.add(plutusData);
    });
  }
  if (type === "Raw") {
    paramsToApply.params.forEach((param) => {
      const plutusData = C.PlutusData.from_json(JSON.stringify(param), C.PlutusDatumSchema.DetailedSchema);
      plutusList.add(plutusData);
    });
  }
  return bytesToHex(
    C.apply_params_to_plutus_script(
      plutusList,
      C.PlutusScript.from_bytes(hexToBytes(applyDoubleCborEncoding(plutusScript)))
    ).to_bytes()
  );
}

export const blueprint = aikenScripts;
