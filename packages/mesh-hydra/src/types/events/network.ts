export interface HydraBaseEvent {
  tag: string;
  seq: number;
  timestamp: string;
}

export interface NetworkConnected extends HydraBaseEvent {
  tag: "NetworkConnected";
}

export interface NetworkDisconnected extends HydraBaseEvent {
  tag: "NetworkDisconnected";
}

export interface NetworkVersionMismatch extends HydraBaseEvent {
  tag: "NetworkVersionMismatch";
  ourVersion: number;
  theirVersion: number | null;
}

export interface NetworkClusterIDMismatch extends HydraBaseEvent {
  tag: "NetworkClusterIDMismatch";
  clusterPeers: string;
  misconfiguredPeers: string;
}

export interface PeerConnected extends HydraBaseEvent {
  tag: "PeerConnected";
  peer: { hostname: string; port: number };
}

export interface PeerDisconnected extends HydraBaseEvent {
  tag: "PeerDisconnected";
  peer: { hostname: string; port: number };
}
export interface EventLogRotated extends HydraBaseEvent {
  tag: "EventLogRotated"; 
};


export type NetworkEvent =
  | NetworkConnected
  | NetworkDisconnected
  | NetworkVersionMismatch
  | NetworkClusterIDMismatch
  | PeerConnected
  | PeerDisconnected
  | EventLogRotated;
