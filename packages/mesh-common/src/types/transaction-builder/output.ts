import { Asset, PlutusScript } from "..";
import { BuilderData } from "./data";

export type Output = {
  address: string;
  amount: Asset[];
  datum?: {
    type: "Hash" | "Inline" | "Embedded";
    data: BuilderData;
  };
  referenceScript?: PlutusScript;
};
