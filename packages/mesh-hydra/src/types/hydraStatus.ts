export type hydraStatus = (typeof status)[number];

export function hydraStatus(value: {
  headStatus?: string;
  tag?: string;
}): hydraStatus | null {
  if (value.headStatus === "Open") return "OPEN";

  switch (value.tag) {
    case "HeadIsInitializing":
      return "INITIALIZING";
    case "HeadIsOpen":
      return "OPEN";
    case "HeadIsClosed":
      return "CLOSED";
    case "ReadyToFanout":
      return "FANOUT_POSSIBLE";
    case "HeadIsFinalized":
      return "FINAL";
    default:
      return null;
  }
}

const status = [
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
