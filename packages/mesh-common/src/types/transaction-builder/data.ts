import { Budget, Data } from "..";

export type BuilderData =
  | {
      type: "Mesh";
      content: Data;
    }
  | {
      type: "JSON";
      content: object | string;
    }
  | {
      type: "CBOR";
      content: string;
    };

export type Redeemer = {
  data: BuilderData;
  exUnits: Budget;
};

export type DatumSource =
  | {
      type: "Provided";
      data: BuilderData;
    }
  | {
      type: "Inline";
      txHash: string;
      txIndex: number;
    };
