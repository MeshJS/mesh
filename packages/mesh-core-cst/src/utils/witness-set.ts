import {
  CborSet,
  HexBlob,
  Transaction,
  TransactionWitnessSet,
  TxCBOR,
  VkeyWitness,
} from "../types";

export const addVKeyWitnessSetToTransaction = (
  txHex: string,
  vkeyWitnessSet: string,
): string => {
  const tx = Transaction.fromCbor(TxCBOR(txHex));
  const currentWitnessSet = tx.witnessSet();
  const newVkeyWitnessSet = TransactionWitnessSet.fromCbor(
    HexBlob(vkeyWitnessSet),
  );

  const currentVkeyWitnesses = currentWitnessSet.vkeys();
  const newVkeyWitnesses = newVkeyWitnessSet.vkeys();
  const allVkeyWitnesses = [
    ...(currentVkeyWitnesses?.values() ?? []),
    ...(newVkeyWitnesses?.values() ?? []),
  ];

  currentWitnessSet.setVkeys(
    CborSet.fromCore(
      allVkeyWitnesses.map((vkw) => vkw.toCore()),
      VkeyWitness.fromCore,
    ),
  );
  tx.setWitnessSet(currentWitnessSet);
  return tx.toCbor();
};
