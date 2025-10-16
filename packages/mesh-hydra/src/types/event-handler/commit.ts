import { ServerOutput } from "..";
import { HandlerMap } from "./handler";

export type CommitHandlerMap = HandlerMap<ServerOutput, "Commit">;

export const commitHandlers: Partial<CommitHandlerMap> = {
  CommitApproved: () => {},
  CommitRecorded: () => {},
  CommitFinalized: () => {},
  CommitRecovered: () => {},
};
