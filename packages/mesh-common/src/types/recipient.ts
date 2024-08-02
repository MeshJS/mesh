import { Data } from "./data";

// import { NativeScript } from './native-script';
// import { PlutusScript } from './plutus-script';

export type Recipient =
  | string
  | {
      address: string;
      datum?: {
        value: Data;
        inline?: boolean;
      };
      // script?: PlutusScript | NativeScript;
    };
