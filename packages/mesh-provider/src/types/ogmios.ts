export type OgmiosAdditionalUtxoValue = {
  ada: {
    lovelace: number;
  } & Record<string, Record<string, number>>;
};

export type OgmiosAdditionalUtxo = {
  transaction: {
    id: string;
  };
  index: number;
  address: string;
  value: OgmiosAdditionalUtxoValue;
};

export type OgmiosAdditionalUtxos = Array<OgmiosAdditionalUtxo>;
