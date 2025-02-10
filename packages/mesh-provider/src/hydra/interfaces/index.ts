export interface IHydraTransaction {
  type: "Tx ConwayEra" | "Unwitnessed Tx ConwayEra" | "Witnessed Tx ConwayEra";
  description: string;
  cborHex: string;
  txId?: string;
}

export interface ICommandFailed {
  tag: "CommandFailed";
  clientInput:
    | {
        tag: "Init";
      }
    | {
        tag: "Abort";
      }
    | { tag: "NewTx"; transaction: IHydraTransaction }
    | { tag: "GetUTxO" }
    | { tag: "Decommit"; decommitTx: IHydraTransaction }
    | { tag: "Close" }
    | { tag: "Contest" }
    | { tag: "Fanout" };
  seq: number;
  timestamp: string;
}
