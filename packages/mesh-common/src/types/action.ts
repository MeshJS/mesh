import { Data } from "./data";

export type RedeemerTagType = "CERT" | "MINT" | "REWARD" | "SPEND" | "VOTE" | "PROPOSE";

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
