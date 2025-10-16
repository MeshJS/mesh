import { ServerOutput } from "..";
import { HandlerMap } from "./handler";

export type DecommitHandlerMap = HandlerMap<ServerOutput, "Decommit">;

export const decommitHandlers: Partial<DecommitHandlerMap> = {
  DecommitRequested: () => {},
  DecommitApproved: () => {},
  DecommitFinalized: () => {},
  DecommitInvalid: () => {},
};
