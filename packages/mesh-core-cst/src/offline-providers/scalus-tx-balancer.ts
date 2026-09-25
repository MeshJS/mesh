import {
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  ITxBalancer,
  Network,
  Protocol,
  UTxO,
} from "@meshsdk/common";

import { balanceTxWithScalus } from "./balance-tx-scalus";

/**
 * An {@link ITxBalancer} backed by Scalus, for `new MeshTxBuilder({ balancer })`.
 *
 * With one configured, `complete()` no longer hands back a transaction whose execution units were
 * computed before the change output existed. The builder still chooses the inputs and places the
 * change; this settles the fee, the units and that output's lovelace against each other.
 *
 * ```ts
 * const balancer = new ScalusTxBalancer("preprod");
 * const txHex = await new MeshTxBuilder({ fetcher, evaluator, balancer })
 *   .txOut(bob, [{ unit: "lovelace", quantity: "25000000" }])
 *   .changeAddress(alice)
 *   .selectUtxosFrom(utxos)
 *   .complete();
 * ```
 */
export class ScalusTxBalancer implements ITxBalancer {
  constructor(
    private readonly network: Network,
    /** The ledger protocol version to cost against. Mainnet runs 11 (van Rossem). */
    private readonly protocolMajorVersion: number = 11,
    private readonly costModels: number[][] = [
      DEFAULT_V1_COST_MODEL_LIST,
      DEFAULT_V2_COST_MODEL_LIST,
      DEFAULT_V3_COST_MODEL_LIST,
    ],
    /**
     * Hex key hashes for signatures the transaction does not name, such as the keys a native
     * script requires. Inferred signers are always included as well.
     */
    private readonly extraSigners: string[] = [],
  ) {}

  balanceTx = async (
    tx: string,
    utxos: UTxO[],
    params: Protocol,
    changeOutputIndex: number,
  ): Promise<string> =>
    balanceTxWithScalus(
      tx,
      utxos,
      params,
      this.network,
      changeOutputIndex,
      this.protocolMajorVersion,
      this.costModels,
      this.extraSigners,
    );
}
