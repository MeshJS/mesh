import { hydraTransaction } from "../hydra/hydraTransaction";
import { HydraUTxOs } from "../hydra/hydraUTxOs";
import { HydraBaseEvent } from "./network";

export interface TxValid extends HydraBaseEvent {
    tag: "TxValid";
    headId: string;
    transactionId: string;
  }
  
  export interface TxInvalid extends HydraBaseEvent {
    tag: "TxInvalid";
    headId: string;
    utxo: HydraUTxOs;
    transaction: hydraTransaction;
    validationError: {
      reason: string
    };
  }
  
  export type TransactionEvents = 
  | TxValid
  | TxInvalid;