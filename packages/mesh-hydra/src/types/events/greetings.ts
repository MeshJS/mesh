import { HydraUTxOs } from "..";

export interface Greetings {
    tag: "Greetings";
    me: {
      vkey: string;
    };
    headStatus:
      | "Idle"
      | "Initializing"
      | "Open"
      | "Closed"
      | "FanoutPossible"
      | "Final";
    hydraHeadId: string;
    snapshotUtxo: HydraUTxOs;
    timestamp?: string;
    hydraNodeVersion: string;
  }