import { Data } from "@meshsdk/common";
import { castDataToPlutusData } from "@meshsdk/core-csl";

export const serializeData = (mesh: Data, json: any) => {
  const meshData = castDataToPlutusData({
    type: "Mesh",
    content: mesh,
  }).to_hex();
  const jsonData = castDataToPlutusData({
    type: "JSON",
    content: JSON.stringify(json),
  }).to_hex();
  return [meshData, jsonData];
};
