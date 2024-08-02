import { Redeemer } from "./data";
import { ScriptSource, SimpleScriptSourceInfo } from "./script";

export type MintItem = {
  type: "Plutus" | "Native";
  policyId: string;
  assetName: string;
  amount: string;
  redeemer?: Redeemer;
  scriptSource?: ScriptSource | SimpleScriptSourceInfo;
};
