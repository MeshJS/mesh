export type hReferenceScript = {
  scriptLanguage: string;
  script: {
    cborHex: string;
    description: string;
    type:
      | "SimpleScript"
      | "PlutusScriptV1"
      | "PlutusScriptV2"
      | "PlutusScriptV3";
  };
};
