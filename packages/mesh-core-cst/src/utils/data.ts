import { HexBlob } from "@cardano-sdk/util";

import { BuilderData, Data, toBytes } from "@meshsdk/common";

import {
  ConstrPlutusData,
  DatumHash,
  PlutusData,
  PlutusDataKind,
  PlutusList,
  PlutusMap,
} from "../types";

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

type ConstrPlutusDataJson = {
  constructor: number | bigint | string;
  fields: object[];
};

const isConstrPlutusDataJson = (data: object): data is ConstrPlutusDataJson => {
  return (
    typeof data === "object" &&
    "constructor" in data &&
    (typeof data.constructor === "number" ||
      typeof data.constructor === "bigint" ||
      typeof data.constructor === "string") &&
    "fields" in data &&
    Array.isArray(data.fields)
  );
};

type KeyValuePlutusDataJson = {
  k: object;
  v: object;
};

function isMapPlutusDataJson(data: any) {
  return typeof data === "object" && Array.isArray(data);
}

function isKeyValuePlutusDataJson(data: any): data is KeyValuePlutusDataJson {
  return (
    typeof data === "object" &&
    "k" in data &&
    typeof data.k === "object" &&
    "v" in data &&
    typeof data.v === "object"
  );
}

export const fromJsonToPlutusData = (data: object): PlutusData => {
  if (isConstrPlutusDataJson(data)) {
    const plutusList = new PlutusList();
    data.fields.map((val) => {
      plutusList.add(fromJsonToPlutusData(val));
    });
    const plutusConstrData = new ConstrPlutusData(
      BigInt(data.constructor),
      plutusList,
    );
    return PlutusData.newConstrPlutusData(plutusConstrData);
  } else if ("int" in data && Object.keys(data).length === 1) {
    if (
      typeof data.int === "bigint" ||
      typeof data.int === "number" ||
      typeof data.int === "string"
    ) {
      return PlutusData.newInteger(BigInt(data.int));
    } else {
      throw new Error(
        "Malformed int field in Plutus data, expected one of bigint, number or string",
      );
    }
  } else if ("bytes" in data && Object.keys(data).length === 1) {
    if (typeof data.bytes === "string") {
      return PlutusData.newBytes(Buffer.from(data.bytes, "hex"));
    } else {
      throw new Error("Malformed bytes field in Plutus data, expected string");
    }
  } else if ("list" in data && Object.keys(data).length === 1) {
    if (Array.isArray(data.list)) {
      const plutusList = new PlutusList();
      data.list.map((val) => {
        plutusList.add(fromJsonToPlutusData(val));
      });
      return PlutusData.newList(plutusList);
    } else {
      throw new Error("Malformed list field in Plutus data, expected list");
    }
  } else if ("map" in data && Object.keys(data).length === 1) {
    if (isMapPlutusDataJson(data.map)) {
      const plutusMap = new PlutusMap();
      data.map.forEach((val) => {
        if (isKeyValuePlutusDataJson(val)) {
          plutusMap.insert(
            fromJsonToPlutusData(val.k),
            fromJsonToPlutusData(val.v),
          );
        } else {
          throw new Error("Malformed key value pair in Plutus data map");
        }
      });
      return PlutusData.newMap(plutusMap);
    } else {
      console.log(data);
      throw new Error("Malformed map field in Plutus data");
    }
  } else {
    throw new Error("Malformed Plutus data json");
  }
};

export const fromBuilderToPlutusData = (data: BuilderData): PlutusData => {
  if (data.type === "Mesh") {
    return toPlutusData(data.content);
  } else if (data.type === "CBOR") {
    return PlutusData.fromCbor(HexBlob(data.content));
  } else if (data.type === "JSON") {
    let content: object;
    if (typeof data.content === "string") {
      content = JSON.parse(data.content);
    } else {
      content = data.content;
    }
    return fromJsonToPlutusData(content);
  } else {
    throw new Error(
      "Malformed builder data, expected types of, Mesh, CBOR or JSON",
    );
  }
};

export const fromPlutusDataToJson = (data: PlutusData): object => {
  if (data.getKind() === PlutusDataKind.ConstrPlutusData) {
    const plutusData = data.asConstrPlutusData();
    if (plutusData !== undefined) {
      const fields = plutusData.getData();
      const list: object[] = [];
      for (let i = 0; i < fields.getLength(); i++) {
        const element = fields.get(i);
        list.push(fromPlutusDataToJson(element));
      }
      return {
        constructor: plutusData.getAlternative(),
        fields: list,
      };
    } else {
      throw new Error("Invalid constructor data found");
    }
  } else if (data.getKind() === PlutusDataKind.Map) {
    const plutusMap = data.asMap();
    const mapList: {
      k: object;
      v: object;
    }[] = [];
    if (plutusMap !== undefined) {
      const keys = plutusMap.getKeys();
      for (let i = 0; i < keys.getLength(); i++) {
        const key = keys.get(i);
        const value = plutusMap.get(key);
        if (value) {
          mapList.push({
            k: fromPlutusDataToJson(key),
            v: fromPlutusDataToJson(value),
          });
        }
      }
      return {
        map: mapList,
      };
    } else {
      throw new Error("Invalid map data found");
    }
  } else if (data.getKind() === PlutusDataKind.List) {
    const plutusList = data.asList();
    if (plutusList !== undefined) {
      const list: object[] = [];
      for (let i = 0; i < plutusList.getLength(); i++) {
        const element = plutusList.get(i);
        list.push(fromPlutusDataToJson(element));
      }
      return { list: list };
    } else {
      throw new Error("Invalid list data found");
    }
  } else if (data.getKind() === PlutusDataKind.Integer) {
    const plutusInt = data.asInteger();
    if (plutusInt !== undefined) {
      return {
        int: plutusInt,
      };
    } else {
      throw new Error("Invalid integer data found");
    }
  } else if (data.getKind() === PlutusDataKind.Bytes) {
    const plutusBytes = data.asBoundedBytes();
    if (plutusBytes !== undefined) {
      return {
        bytes: Buffer.from(plutusBytes).toString("hex"),
      };
    } else {
      throw new Error("Invalid bytes data found");
    }
  } else {
    throw new Error("Invalid Plutus data found");
  }
};

const datumCborToJson = <T = any>(datumCbor: string): T => {
  const parsedDatum = PlutusData.fromCbor(HexBlob(datumCbor));
  return fromPlutusDataToJson(parsedDatum) as T;
};
export const parseDatumCbor = <T = any>(datumCbor: string): T => {
  return datumCborToJson(datumCbor) as T;
};

export const parseInlineDatum = <T extends { inline_datum?: string }, X>(
  utxo: T,
): X => {
  const datumCbor: string = utxo.inline_datum || "";
  return datumCborToJson(datumCbor) as X;
};

export const deserializeDataHash = (dataHash: string): DatumHash =>
  DatumHash(dataHash);

export const deserializePlutusData = (plutusData: string): PlutusData =>
  PlutusData.fromCbor(HexBlob(plutusData));
