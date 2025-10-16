import { ServerOutput } from "..";
import { HandlerMap } from "./handler";

export type DepositHandlerMap = HandlerMap<ServerOutput, "Deposit">;

export const depositHandlers: Partial<DepositHandlerMap> = {
  DepositActivated: () => {},
  DepositExpired: () => {},
};
