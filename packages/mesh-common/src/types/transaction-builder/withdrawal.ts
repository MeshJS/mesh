import { Redeemer } from "./data";
import { ScriptSource, SimpleScriptSourceInfo } from "./script";

export type Withdrawal =
  | PubKeyWithdrawal
  | ScriptWithdrawal
  | SimpleScriptWithdrawal;

export type PubKeyWithdrawal = {
  type: "PubKeyWithdrawal";
  address: string;
  coin: string;
};

export type ScriptWithdrawal = {
  type: "ScriptWithdrawal";
  address: string;
  coin: string;
  scriptSource?: ScriptSource;
  redeemer?: Redeemer;
};

export type SimpleScriptWithdrawal = {
  type: "SimpleScriptWithdrawal";
  address: string;
  coin: string;
  scriptSource?: SimpleScriptSourceInfo;
};
