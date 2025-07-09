import { IFetcher, IMeshTxSerializer, UTxO } from "@meshsdk/common";

/**
 * TxParser class to parse transaction hex strings and resolve UTxOs.
 *
 * It is used for either manipulating transactions or for unit testing transaction buildings.
 */
export class TxParser {
  constructor(
    public serializer: IMeshTxSerializer,
    public fetcher?: IFetcher,
  ) {}

  parse = async (txHex: string, providedUtxos: UTxO[] = []) => {
    const resolvedUtxos: UTxO[] = [...providedUtxos];

    const resolvedUtxosSet: Set<string> = new Set(
      providedUtxos.map(
        (utxo) => `${utxo.input.txHash}#${utxo.input.outputIndex}`,
      ),
    );
    const toResolveUtxos: Record<string, number[]> = {};
    const fetchResult: Record<string, UTxO[]> = {};

    // parse utxo inputs
    this.serializer.parser.getRequiredInputs(txHex).forEach((input) => {
      if (!resolvedUtxosSet.has(`${input.txHash}#${input.outputIndex}`)) {
        if (!toResolveUtxos[input.txHash]) {
          toResolveUtxos[input.txHash] = [];
        }
        toResolveUtxos[input.txHash]!.push(input.outputIndex);
      }
    });

    // fetch missing utxos
    for (const txHash in toResolveUtxos) {
      const outputIndices = toResolveUtxos[txHash];
      if (!this.fetcher) {
        throw new Error(
          "Fetcher is not provided. Cannot resolve UTxOs without fetcher.",
        );
      }
      const utxos = await this.fetcher.fetchUTxOs(txHash);
      outputIndices?.forEach((outputIndex) => {
        const utxoData = utxos.find(
          (utxo) => utxo.input.outputIndex === outputIndex,
        );
        if (!utxoData) {
          throw new Error(`UTxO not found: ${txHash}:${outputIndex}`);
        }
        resolvedUtxos.push(utxoData);
      });
    }

    this.serializer.parser.parse(txHex, resolvedUtxos);
    return this.serializer.parser.getBuilderBody();
  };

  getBuilderBody = () => this.serializer.parser.getBuilderBody();

  getBuilderBodyWithoutChange = () =>
    this.serializer.parser.getBuilderBodyWithoutChange();

  toTester = () => this.serializer.parser.toTester();
}
