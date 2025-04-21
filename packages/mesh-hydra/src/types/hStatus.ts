const hStatus = [
  "IDLE",
  "DISCONNECTED",
  "CONNECTING",
  "CONNECTED",
  "INITIALIZING",
  "OPEN",
  "CLOSED",
  "FANOUT_POSSIBLE",
  "FINAL",
] as const;

export type hStatus = typeof hStatus[number];
