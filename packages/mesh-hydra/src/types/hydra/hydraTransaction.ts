export type hydraTransaction = {
  type: "Tx ConwayEra" | "Unwitnessed Tx ConwayEra" | "Witnessed Tx ConwayEra";
  description: string;
  cborHex: string;
  txId?: string;
};
