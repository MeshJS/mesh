export const jsonImportCodeMap = {
  Int: "Integer",
  Bool: "Bool",
  ByteArray: "ByteString",
  VerificationKeyHash: "PubKeyHash",
  ScriptHash: "ScriptHash",
  PolicyId: "PolicyId",
  AssetName: "AssetName",
  Pairs: "Pairs",
  Tuple: "Tuple",
  Option: "Option",
  "cardano/address/Credential": "Credential",
  "cardano/transaction/OutputReference": "OutputReference",
  "cardano/address/Address": "PubKeyAddress | ScriptAddress",
};

export const blueprintImportCodeMap = {
  spend: "SpendingBlueprint",
  mint: "MintingBlueprint",
  withdraw: "WithdrawalBlueprint",
  publish: "WithdrawalBlueprint",
};
