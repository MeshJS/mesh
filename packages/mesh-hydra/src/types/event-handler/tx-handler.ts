import { ClientInput } from "..";
import { HandlerMap } from "./handler";

export type PostChainTxHandlerMap = HandlerMap<ClientInput,"">;
export const postChainTxHandlers: Partial<PostChainTxHandlerMap> = {
  Init: () => {},
  Abort: () => {},
  Recover: () => {},
  Close: () => {},
  Contest: () => {},
  Fanout: () => {},
};
