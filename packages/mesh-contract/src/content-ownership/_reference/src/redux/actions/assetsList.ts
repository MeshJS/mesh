
// assetsList.ts
export const ADD_ASSETSLIST = 'ADD_ASSETSLIST';
export const UPDATE_ASSETSLIST = 'UPDATE_ASSETSLIST';
export const RESET_ASSETSLIST = 'RESET_ASSETSLIST';

export interface AddAssetsList {
  type: typeof ADD_ASSETSLIST;
  data: any;
}

export interface UpdateAssetsList {
  type: typeof UPDATE_ASSETSLIST;
  data: any;
}

export interface ResetAssetsList {
  type: typeof RESET_ASSETSLIST;
}

export type AssetsListActionTypes = AddAssetsList | UpdateAssetsList | ResetAssetsList;

export function addAssetsList(data: any): AddAssetsList {
  return { type: ADD_ASSETSLIST, data }
}

export function updateAssetsList(data: any): UpdateAssetsList {
  return { type: UPDATE_ASSETSLIST, data }
}

export function resetAssetsList(): ResetAssetsList {
  return { type: RESET_ASSETSLIST }
}
