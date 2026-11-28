import type { LanguageVersion } from "@meshsdk/common";
import {
  blake2b,
  hashScriptData,
  Serialization,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";

import { TxBuildError } from "./errors";

/*
 * The script data hash and the auxiliary data hash commit to the exact bytes of what they hash,
 * as the transaction carries them. Both are therefore taken from a serialized transaction: what
 * the hash covers is read back from its CBOR, whose original bytes are kept.
 */

/** Plutus versions by language number, the index of their cost model */
const LANGUAGES: readonly LanguageVersion[] = ["V1", "V2", "V3"];

/**
 * The script data hash of a serialized transaction: its redeemers, its datums and the cost
 * models of the Plutus versions it runs. Undefined when it has neither redeemers nor datums.
 * @param txHex The transaction, in CBOR hex
 * @param languages Every Plutus version of a script the transaction runs, attached or referenced
 * @param costModels Cost models by Plutus language number, V1 first
 * @throws TxBuildError MISSING_PARAMETER when a version the transaction runs has no cost model,
 *   or an empty one: a hash without it would make a transaction the ledger refuses
 */
export const scriptDataHashOf = (
  txHex: string,
  languages: ReadonlySet<LanguageVersion>,
  costModels: readonly (readonly number[])[] = [],
): string | undefined => {
  const missing = LANGUAGES.filter(
    (language, i) => languages.has(language) && !costModels[i]?.length,
  );
  if (missing.length > 0) {
    // Said without naming the builder: assembleTxPrototype raises it too
    const them = missing.length === 1 ? "it" : "them";
    throw new TxBuildError(
      "MISSING_PARAMETER",
      `the transaction runs Plutus ${missing.join(", ")} scripts, and no cost model is given for ${them}: pass costModels that hold ${them}`,
      { details: { parameter: "costModels" } },
    );
  }
  const witnessSet = Transaction.fromCbor(TxCBOR(txHex)).witnessSet();
  const costmdls = new Serialization.Costmdls();
  if (languages.has("V1"))
    costmdls.insert(Serialization.CostModel.newPlutusV1([...costModels[0]!]));
  if (languages.has("V2"))
    costmdls.insert(Serialization.CostModel.newPlutusV2([...costModels[1]!]));
  if (languages.has("V3"))
    costmdls.insert(Serialization.CostModel.newPlutusV3([...costModels[2]!]));
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
