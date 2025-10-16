import type { ServerOutput } from "..";
import type { HandlerMap } from "./handler";

export const headCycleHandlers: Partial<
  HandlerMap<ServerOutput, "Head" | "Ready">
> = {
  HeadIsInitializing: () => {},
  HeadIsOpen: () => {},
  HeadIsClosed: () => {},
  HeadIsContested: () => {},
  ReadyToFanout: () => {},
  HeadIsAborted: () => {},
  HeadIsFinalized: () => {},
};
