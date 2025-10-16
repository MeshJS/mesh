import { ServerOutput } from "..";
import { HandlerMap } from "./handler";

export type SnapshotHandlerMap = HandlerMap<ServerOutput, "Snapshot">;

export const snapshotHandlers: Partial<SnapshotHandlerMap> = {
  SnapshotSideLoaded: () => {},
  SnapshotConfirmed: () => {},
};
