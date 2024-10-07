export type Credential =
  | {
      type: "ScriptHash";
      scriptHash: string;
    }
  | {
      type: "KeyHash";
      keyHash: string;
    };
