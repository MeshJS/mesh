import {IFetcher, MeshTxBuilderBody} from "@meshsdk/common";
import {js_get_required_inputs_to_resolve, js_parse_tx_body, JsVecString} from "@sidan-lab/whisky-js-nodejs";

export const parseTransactionToBuilderBody = async (transactionHex: string, fetcher: IFetcher): Promise<MeshTxBuilderBody> => {
  try {
    const requiredUtxosResult = js_get_required_inputs_to_resolve(transactionHex);
    if(requiredUtxosResult.get_status() !== "success") {
      throw new Error(`Failed to get required inputs: ${requiredUtxosResult.get_error()}`);
    }

    const resolvedUtxos = []
    const requiredUtxos: string[] = JSON.parse(requiredUtxosResult.get_data());
    for (const txIn of requiredUtxos) {
      const parts = txIn.split('#');
      if (parts.length !== 2) {
        throw new Error(`Invalid UTxO format: ${txIn}`);
      }

      const [txHash, outputIndex] = parts;
      if (!txHash || !outputIndex) {
        throw new Error(`Invalid UTxO format: ${txIn}. Expected format is txHash#outputIndex`);
      }

      const utxoData = await fetcher.fetchUTxOs(txHash, parseInt(outputIndex));
      if (!utxoData) {
        throw new Error(`UTxO not found: ${txHash}:${outputIndex}`);
      }
      for(const utxo of utxoData) {
        resolvedUtxos.push(utxo);
      }
    }

    const jsUtxos = JsVecString.new();
    for (const utxo of resolvedUtxos) {
      jsUtxos.add(JSON.stringify(utxo));
    }

    const transactionResult = js_parse_tx_body(transactionHex, jsUtxos);
    if (transactionResult.get_status() !== "success") {
      throw new Error(`Failed to parse transaction: ${transactionResult.get_error()}`);
    }
    return JSON.parse(transactionResult.get_data());

  } catch (error) {
    throw new Error(`Failed to parse transaction: ${error}`);
  }
}
