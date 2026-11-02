import { Data } from "@meshsdk/common";
import { fromBuilderToPlutusData } from "@meshsdk/core-cst";

export const serializeData = (mesh: Data, json: any) => {
  const meshData = fromBuilderToPlutusData({
    type: "Mesh",
    content: mesh,
  }).toCbor();
  const jsonData = fromBuilderToPlutusData({
    type: "JSON",
    content: JSON.stringify(json),
  }).toCbor();
  return [meshData, jsonData];
};
