import { Data } from './Data';
import { NativeScript } from './NativeScript';
import { PlutusScript } from './PlutusScript';

export type Recipient = string | {
  address: string;
  datum?: {
    value: Data;
    inline?: boolean;
  };
  script?: PlutusScript | NativeScript;
};
