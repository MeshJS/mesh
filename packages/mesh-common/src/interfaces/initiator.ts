import { UTxO } from "../types";

export interface IInitiator {
  getChangeAddress(): SometimesPromise<string>;
  getCollateral(): SometimesPromise<UTxO[]>;
  getUtxos(): SometimesPromise<UTxO[]>;
}

type SometimesPromise<T> = Promise<T> | T;
