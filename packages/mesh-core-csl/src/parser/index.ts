import { js_parse_tx_body, JsVecString } from "@sidan-lab/whisky-js-nodejs";

import { emptyTxBuilderBody, MeshTxBuilderBody, UTxO } from "@meshsdk/common";

import { txBuilderBodyFromObj } from "../core";
import { calculateTxHash } from "../utils";

export class CSLParser {
  resolvedUtxos: UTxO[];
  txBuilderBody: MeshTxBuilderBody = emptyTxBuilderBody();
  txHex: string = "";
  txHash: string = "";

  constructor(txHex: string, resolvedUtxos: UTxO[] = []) {
    this.txHex = txHex;
    this.txHash = calculateTxHash(txHex);
    this.resolvedUtxos = resolvedUtxos;
    const jsUtxos = JsVecString.new();
    for (const utxo of resolvedUtxos) {
      jsUtxos.add(JSON.stringify(utxo));
    }

    const wasmResult = js_parse_tx_body(txHex, jsUtxos);
    if (wasmResult.get_status() !== "success") {
      throw new Error(`CSLParser parse error: ${wasmResult.get_error()}`);
    }
    const txBodyJson = wasmResult.get_data();
    console.log("txBodyJson", txBodyJson);

    const txBodyObj = txBuilderBodyFromObj(txBodyJson);
    console.log("txBodyObj", txBodyObj);

    this.txBuilderBody = txBuilderBodyFromObj(txBodyJson);
  }
}
