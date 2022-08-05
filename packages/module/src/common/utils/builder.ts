import { csl } from '../../core';
import { toBytes } from './converter';
import type { PlutusData } from '../../core';
import type { DataContent } from '../types';

export const buildPlutusData = (content: DataContent): PlutusData => {
  switch (typeof content) {
    case 'string':
      return csl.PlutusData.new_bytes(toBytes(content));
    case 'number':
      return csl.PlutusData.new_integer(
        csl.BigInt.from_str(content.toString())
      );
    case 'object':
      if (Array.isArray(content)) {
        const plutusList = csl.PlutusList.new();
        content.forEach((element) => {
          plutusList.add(buildPlutusData(element));
        });
        return csl.PlutusData.new_list(plutusList);
      } else {
        const plutusMap = csl.PlutusMap.new();
        Object.keys(content).forEach((key) => {
          plutusMap.insert(buildPlutusData(key), buildPlutusData(content[key]));
        });
        return csl.PlutusData.new_map(plutusMap);
      }
    default:
      throw new Error(`Couldn't build PlutusData of type: ${typeof content}.`);
  }
};
