export type OgmiosAdditionalUtxo = {
  transaction: {
    id: string;
  };
  index: number;
  address: string;
  value: {
    ada: {
      lovelace: number;
    };
  } & Record<string, Record<string, number>>;
};

export type OgmiosAdditionalUtxos = Array<OgmiosAdditionalUtxo>;