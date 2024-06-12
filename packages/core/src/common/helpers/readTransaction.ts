import { csl } from '@mesh/core';
import { deserializeTx } from '@mesh/common/utils';

export const readTransaction = (tx: string): csl.TransactionJSON => {
  return deserializeTx(tx).to_js_value();
};
