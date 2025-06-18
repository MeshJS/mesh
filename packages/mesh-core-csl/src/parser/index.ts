import { js_parse_tx_body } from "@sidan-lab/whisky-js-nodejs";

import {
  emptyTxBuilderBody,
  IFetcher,
  MeshTxBuilderBody,
  TxTester,
  UTxO,
} from "@meshsdk/common";

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
    const wasmResult = js_parse_tx_body(txHex, resolvedUtxos as any);
    if (wasmResult.get_status() !== "success") {
      throw new Error(`CSLParser parse error: ${wasmResult.get_error()}`);
    }
    const txBodyJson = wasmResult.get_data();
    this.txBuilderBody = txBuilderBodyFromObj(txBodyJson);
  }

  toTester = () => {
    return new TxTester(this.txBuilderBody);
  };

  getBuilderBody = () => {
    return this.txBuilderBody;
  };

  getBuilderBodyWithoutChange = () => {
    const txBuilderBody = { ...this.txBuilderBody };
    txBuilderBody.inputs = txBuilderBody.inputs.slice(0, -1);
    return txBuilderBody;
  };
}
