import { Asset } from "../asset";
import { UTxO } from "../utxo";
import { DatumSource, Redeemer } from "./data";
import { ScriptSource, SimpleScriptSourceInfo } from "./script";

export type RefTxIn = { txHash: string; txIndex: number; scriptSize?: number };

export type TxInParameter = {
  txHash: string;
  txIndex: number;
  amount?: Asset[];
  address?: string;
  scriptSize?: number;
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

export const txInToUtxo = (txIn: TxInParameter): UTxO => {
  return {
    input: {
      txHash: txIn.txHash,
      outputIndex: txIn.txIndex,
    },
    output: {
      address: txIn.address || "",
      amount: txIn.amount || [],
    },
  };
};
