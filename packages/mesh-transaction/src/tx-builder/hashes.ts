import type { LanguageVersion } from "@meshsdk/common";
import {
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
} from "@meshsdk/common";
import {
  blake2b,
  hashScriptData,
  Serialization,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";

/*
 * The script data hash and the auxiliary data hash commit to the exact bytes of what they hash,
 * as the transaction carries them. Both are therefore taken from a serialized transaction: what
 * the hash covers is read back from its CBOR, whose original bytes are kept.
 */

/**
 * The script data hash of a serialized transaction: its redeemers, its datums and the cost
 * models of the Plutus versions it runs. Undefined when it has neither redeemers nor datums.
 * @param txHex The transaction, in CBOR hex
 * @param languages Every Plutus version of a script the transaction runs, attached or referenced
 * @param costModels Cost models of Plutus V1, V2 and V3, in that order; the defaults otherwise
 */
export const scriptDataHashOf = (
  txHex: string,
  languages: ReadonlySet<LanguageVersion>,
  costModels: readonly (readonly number[])[] = [],
): string | undefined => {
  const witnessSet = Transaction.fromCbor(TxCBOR(txHex)).witnessSet();
  const costmdls = new Serialization.Costmdls();
  if (languages.has("V1"))
    costmdls.insert(
      Serialization.CostModel.newPlutusV1([
        ...(costModels[0] ?? DEFAULT_V1_COST_MODEL_LIST),
      ]),
    );
  if (languages.has("V2"))
    costmdls.insert(
      Serialization.CostModel.newPlutusV2([
        ...(costModels[1] ?? DEFAULT_V2_COST_MODEL_LIST),
      ]),
    );
  if (languages.has("V3"))
    costmdls.insert(
      Serialization.CostModel.newPlutusV3([
        ...(costModels[2] ?? DEFAULT_V3_COST_MODEL_LIST),
      ]),
    );
  const datums = witnessSet.plutusData();
  return hashScriptData(
    costmdls,
    witnessSet.redeemers(),
    datums && datums.size() > 0 ? datums : undefined,
  )?.toString();
};

/** The auxiliary data hash of a serialized transaction; undefined when it has none */
export const auxiliaryDataHashOf = (txHex: string): string | undefined => {
  const auxiliaryData = Transaction.fromCbor(TxCBOR(txHex)).auxiliaryData();
  return auxiliaryData
    ? blake2b.hash(auxiliaryData.toCbor(), 32).toString()
    : undefined;
};
