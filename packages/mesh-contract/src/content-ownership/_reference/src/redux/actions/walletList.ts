
// walletList.ts
export const ADD_WALLETLIST = 'ADD_WALLETLIST';
export const UPDATE_WALLETLIST = 'UPDATE_WALLETLIST';
export const RESET_WALLETLIST = 'RESET_WALLETLIST';

export interface AddWalletList {
  type: typeof ADD_WALLETLIST;
  data: any;
}

export interface UpdateWalletList {
  type: typeof UPDATE_WALLETLIST;
  data: any;
}

export interface ResetWalletList {
  type: typeof RESET_WALLETLIST;
}

export type WalletListActionTypes = AddWalletList | UpdateWalletList | ResetWalletList;

export function addWalletList(data: any): AddWalletList {
  return { type: ADD_WALLETLIST, data }
}

export function updateWalletList(data: any): UpdateWalletList {
  return { type: UPDATE_WALLETLIST, data }
}

export function resetWalletList(): ResetWalletList {
  return { type: RESET_WALLETLIST }
}
