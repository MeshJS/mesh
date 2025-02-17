import { UTxO } from "../types";

export interface IInitiator {
  getChangeAddress(): Promise<string>;
  getCollateral(): Promise<UTxO[]>;
  getUtxos(): Promise<UTxO[]>;
}
