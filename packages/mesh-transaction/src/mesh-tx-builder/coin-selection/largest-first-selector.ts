import { Output, TxIn, UTxO } from "@meshsdk/common";

import {
  BuilderCallbacks,
  IInputSelector,
  ImplicitValue,
  TransactionPrototype,
} from "./coin-selection-interface";

/**
 * @deprecated A mark only: `MeshTxBuilder` selects inputs with the new builder's own selection,
 * with this selector or without one. A strategy of your own is `coinSelection` of `TxBuilder`.
 */
export class LargestFirstInputSelector implements IInputSelector {
  /**
   * @deprecated Always rejects with an `Error`: this class no longer selects. A strategy of your
   * own is `coinSelection` of `TxBuilder`.
   */
  async select(
    _preselectedUtxos: TxIn[],
    _outputs: Output[],
    _implicitValue: ImplicitValue,
    _utxos: UTxO[],
    _changeAddress: string,
    _constraints: BuilderCallbacks,
  ): Promise<TransactionPrototype> {
    throw new Error(
      "LargestFirstInputSelector no longer selects: MeshTxBuilder selects inputs itself; a strategy of your own is coinSelection of TxBuilder",
    );
  }
}
