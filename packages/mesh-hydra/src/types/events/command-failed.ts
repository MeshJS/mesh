import { ClientInput } from "../client-input";
import { HydraParty } from "../hydra/hydra";

export type CommandFailed = {
  tag: "CommandFailed";
  clientInput: ClientInput;
};

export type InvalidInput = {
  tag: "InvalidInput";
  reason: string;
  input: string;
};

export type IgnoredHeadInitializing = {
  tag: "IgnoredHeadInitializing";
  headId: string;
  contestationPeriod: number;
  parties: HydraParty;
  participants: string[];
  seq: number;
  timestamp: string;
};

export type CommandFailedEvent =
  | CommandFailed
  | InvalidInput
  | IgnoredHeadInitializing;
