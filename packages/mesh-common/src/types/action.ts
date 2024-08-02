import { Data } from "./data";

export type RedeemerTagType = "CERT" | "MINT" | "REWARD" | "SPEND";

export type Action = {
  data: Data;
  index: number;
  budget: Budget;
  tag: RedeemerTagType;
};

export type Budget = {
  mem: number;
  steps: number;
};
