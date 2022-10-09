import { Data } from './Data';
import { NativeScript } from './NativeScript';
import { PlutusScript } from './PlutusScript';

export type Recipient = {
  address: string;
  datum?: Data;
  script?: PlutusScript | NativeScript;
};
