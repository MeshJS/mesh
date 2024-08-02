import { csl } from "../deser";

export const calculateTxHash = (txHex: string) => csl.calculate_tx_hash(txHex);

export const signTransaction = (txHex: string, signingKeys: string[]) => {
  const cslSigningKeys = csl.JsVecString.new();
  signingKeys.forEach((key) => {
    cslSigningKeys.add(key);
  });
  const signedTx = csl.sign_transaction(txHex, cslSigningKeys);
  return signedTx;
};
