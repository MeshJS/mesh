
// collateralUtxo.ts
export const ADD_COLLATERALUTXO = 'ADD_COLLATERALUTXO';
export const UPDATE_COLLATERALUTXO = 'UPDATE_COLLATERALUTXO';
export const RESET_COLLATERALUTXO = 'RESET_COLLATERALUTXO';

export interface AddCollateralUtxo {
  type: typeof ADD_COLLATERALUTXO;
  data: any;
}

export interface UpdateCollateralUtxo {
  type: typeof UPDATE_COLLATERALUTXO;
  data: any;
}

export interface ResetCollateralUtxo {
  type: typeof RESET_COLLATERALUTXO;
}

export type CollateralUtxoActionTypes = AddCollateralUtxo | UpdateCollateralUtxo | ResetCollateralUtxo;

export function addCollateralUtxo(data: any): AddCollateralUtxo {
  return { type: ADD_COLLATERALUTXO, data }
}

export function updateCollateralUtxo(data: any): UpdateCollateralUtxo {
  return { type: UPDATE_COLLATERALUTXO, data }
}

export function resetCollateralUtxo(): ResetCollateralUtxo {
  return { type: RESET_COLLATERALUTXO }
}
