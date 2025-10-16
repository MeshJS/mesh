import { ServerOutput } from "..";
import { HandlerMap } from "./handler";

export type TransactionHandlerMap = HandlerMap<ServerOutput, "Tx">;

export const transactionHandlers: Partial<TransactionHandlerMap> = {
  TxValid: () => {},
  TxInvalid: () => {},
};
