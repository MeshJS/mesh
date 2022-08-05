import { csl } from '../../core';
import type { PlutusList } from '../../core';

export const buildPlutusData = (index: number, list: PlutusList) =>
  csl.PlutusData.new_constr_plutus_data(
    csl.ConstrPlutusData.new(csl.BigNum.from_str(index.toString()), list),
  );
