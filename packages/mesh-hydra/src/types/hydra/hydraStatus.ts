export type hydraStatus = (typeof status)[number];

export function getHydraStatus(value: { headStatus?: string; tag?: string }): hydraStatus | null {
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
  "INITIALIZING",
  "OPEN",
  "CLOSED",
  "FANOUT_POSSIBLE",
  "FINAL",
] as const;
