
// walletAddress.ts
export const ADD_WALLETADDRESS = 'ADD_WALLETADDRESS';
export const UPDATE_WALLETADDRESS = 'UPDATE_WALLETADDRESS';
export const RESET_WALLETADDRESS = 'RESET_WALLETADDRESS';

export interface AddWalletAddress {
  type: typeof ADD_WALLETADDRESS;
  data: any;
}

export interface UpdateWalletAddress {
  type: typeof UPDATE_WALLETADDRESS;
  data: any;
}

export interface ResetWalletAddress {
  type: typeof RESET_WALLETADDRESS;
}

export type WalletAddressActionTypes = AddWalletAddress | UpdateWalletAddress | ResetWalletAddress;

export function addWalletAddress(data: any): AddWalletAddress {
  return { type: ADD_WALLETADDRESS, data }
}

export function updateWalletAddress(data: any): UpdateWalletAddress {
  return { type: UPDATE_WALLETADDRESS, data }
}

export function resetWalletAddress(): ResetWalletAddress {
  return { type: RESET_WALLETADDRESS }
}
