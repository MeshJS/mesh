import { ServerOutput } from "..";
import { HandlerMap } from "./handler";

export type CommitHandlerMap = HandlerMap<ServerOutput, "Greetings">;

export const greetingsHandlers: Partial<CommitHandlerMap> = {
  Greetings: () => {},
};