import { csl } from "../deser";
import { parseWasmResult } from "../wasm";

export const calculateTxHash = (txHex: string) => {
  const result = csl.js_calculate_tx_hash(txHex);
  return parseWasmResult(result);
};

export const signTransaction = (txHex: string, signingKeys: string[]) => {
  const cslSigningKeys = csl.JsVecString.new();
  signingKeys.forEach((key) => {
    cslSigningKeys.add(key);
  });
  const result = csl.js_sign_transaction(txHex, cslSigningKeys);
  return parseWasmResult(result);
};
