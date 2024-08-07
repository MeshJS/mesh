import { Redeemer } from "./data";
import { ScriptSource } from "./script";

export type Withdrawal =
  | {
      pubKeyWithdrawal: {
        address: string;
        coin: string;
      };
    }
  | {
      plutusScriptWithdrawal: {
        address: string;
        coin: string;
        scriptSource?: ScriptSource;
        redeemer?: Redeemer;
      };
    };
