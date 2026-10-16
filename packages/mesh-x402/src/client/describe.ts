import { deserializeTx } from "@meshsdk/core-cst";

import { base64ToHex } from "../encoding";

/** Human-readable anatomy of a signed transaction (as carried in `payload.transaction`, base64). For debugging/UIs. */
export const describeTx = (base64Tx: string) => {
  const tx = deserializeTx(base64ToHex(base64Tx));
  const body = tx.body();
  return {
    inputs: body
      .inputs()
      .values()
      .map((i) => `${i.transactionId()}#${Number(i.index())}`),
    outputs: body.outputs().map((o) => ({
      address: o.address().toBech32().toString(),
      lovelace: o.amount().coin().toString(),
      inlineDatum: o.datum()?.asInlineData() !== undefined,
      tokens: o.amount().multiasset()?.size ?? 0,
    })),
    fee: body.fee().toString(),
    ttlSlot: body.ttl()?.toString(),
    vkeyWitnesses: tx.witnessSet().vkeys()?.size() ?? 0,
  };
};
