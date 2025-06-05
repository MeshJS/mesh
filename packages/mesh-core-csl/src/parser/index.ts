import { js_parse_tx_body } from "@sidan-lab/whisky-js-nodejs";

import {
  emptyTxBuilderBody,
  IFetcher,
  MeshTxBuilderBody,
  UTxO,
} from "@meshsdk/common";

export class CSLParser {
  resolvedUtxos: UTxO[];

  constructor(
    public fetcher: IFetcher,
    resolvedUtxos: UTxO[] = [],
  ) {
    this.resolvedUtxos = resolvedUtxos;
  }

  parse = (txHex: string, resolvedUtxos: UTxO[] = []): MeshTxBuilderBody => {
    const wasmResult = js_parse_tx_body(txHex, resolvedUtxos as any);
    if (wasmResult.get_status() !== "success") {
      throw new Error(`CSLParser parse error: ${wasmResult.get_error()}`);
    }
    return wasmResult.get_data() as any;
  };

  toTester = () => {};

  getBuilderBody = () => {};

  getBuilderBodyWithoutChange = () => {};
}
