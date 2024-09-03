import { Asset } from "../asset";
import { DatumSource, Redeemer } from "./data";
import { ScriptSource, SimpleScriptSourceInfo } from "./script";

export type RefTxIn = { txHash: string; txIndex: number };

export type TxInParameter = {
  txHash: string;
  txIndex: number;
  amount?: Asset[];
  address?: string;
};

export type TxIn = PubKeyTxIn | SimpleScriptTxIn | ScriptTxIn;

export type PubKeyTxIn = { type: "PubKey"; txIn: TxInParameter };

export type SimpleScriptTxIn = {
  type: "SimpleScript";
  txIn: TxInParameter;
  simpleScriptTxIn: SimpleScriptTxInParameter;
};

export type SimpleScriptTxInParameter = {
  scriptSource?: SimpleScriptSourceInfo;
};

export type ScriptTxInParameter = {
  scriptSource?: ScriptSource;
  datumSource?: DatumSource;
  redeemer?: Redeemer;
};

export type ScriptTxIn = {
  type: "Script";
  txIn: TxInParameter;
  scriptTxIn: ScriptTxInParameter;
};
