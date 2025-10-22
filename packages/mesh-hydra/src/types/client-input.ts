import { ConfirmedSnapshot, InitialSnapshot } from "./events/snapshot";
import { hydraTransaction } from "./hydra/hydraTransaction";

export type ClientInput =
  | { tag: "Init" }
  | { tag: "Abort" }
  | { tag: "NewTx"; transaction: hydraTransaction }
  | { tag: "Recover", recoverTxId: string }
  | { tag: "Decommit"; transaction: hydraTransaction }
  | { tag: "Close" }
  | { tag: "Contest" }
  | { tag: "Fanout" }
  | { tag: "SideLoadSnapshot"; snapshot: InitialSnapshot | ConfirmedSnapshot };

export const clientInput = {
  init: { tag: "Init" } as ClientInput,
  abort: { tag: "Abort" } as ClientInput,
  newTx: (transaction: hydraTransaction): ClientInput => ({
    tag: "NewTx",
    transaction,
  }),
  recover: (txhash: string): ClientInput => ( { tag: "Recover", recoverTxId: txhash }),
  decommit: (transaction: hydraTransaction): ClientInput => ({
    tag: "Decommit",
    transaction,
  }),
  close: { tag: "Close" } as ClientInput,
  contest: { tag: "Contest" } as ClientInput,
  fanout: { tag: "Fanout" } as ClientInput,
  sideLoadSnapshot: (
    snapshot: InitialSnapshot | ConfirmedSnapshot
  ): ClientInput => ({
    tag: "SideLoadSnapshot",
    snapshot: snapshot,
  }),
};
