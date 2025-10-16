import { ServerOutput } from "..";
import { HandlerMap } from "./handler";

export type CommandHandlerMap = HandlerMap<ServerOutput, "Invalid" | "Ignored">;

export const commandHandlers: Partial<CommandHandlerMap> = {
  InvalidInput: () => {},
  IgnoredHeadInitializing: () => {},
};
