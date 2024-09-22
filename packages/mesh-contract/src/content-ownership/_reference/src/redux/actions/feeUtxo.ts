
// feeUtxo.ts
export const ADD_FEEUTXO = 'ADD_FEEUTXO';
export const UPDATE_FEEUTXO = 'UPDATE_FEEUTXO';
export const RESET_FEEUTXO = 'RESET_FEEUTXO';

export interface AddFeeUtxo {
  type: typeof ADD_FEEUTXO;
  data: any;
}

export interface UpdateFeeUtxo {
  type: typeof UPDATE_FEEUTXO;
  data: any;
}

export interface ResetFeeUtxo {
  type: typeof RESET_FEEUTXO;
}

export type FeeUtxoActionTypes = AddFeeUtxo | UpdateFeeUtxo | ResetFeeUtxo;

export function addFeeUtxo(data: any): AddFeeUtxo {
  return { type: ADD_FEEUTXO, data }
}

export function updateFeeUtxo(data: any): UpdateFeeUtxo {
  return { type: UPDATE_FEEUTXO, data }
}

export function resetFeeUtxo(): ResetFeeUtxo {
  return { type: RESET_FEEUTXO }
}
