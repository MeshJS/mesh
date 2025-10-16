import { ServerOutput } from "..";
import { HandlerMap } from "./handler";

export type NetworkHandlerMap = HandlerMap<
  ServerOutput,
  "Network" | "Peer" | "Event"
>;

export const networkHandlers: Partial<NetworkHandlerMap> = {
  NetworkConnected: () => {},
  NetworkDisconnected: () => {},
  NetworkVersionMismatch: () => {},
  NetworkClusterIDMismatch: () => {},
  PeerConnected: () => {},
  PeerDisconnected: () => {},
  EventLogRotated: () => {},
};
