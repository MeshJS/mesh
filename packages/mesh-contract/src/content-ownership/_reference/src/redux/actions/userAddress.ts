
// userAddress.ts
export const ADD_USERADDRESS = 'ADD_USERADDRESS';
export const UPDATE_USERADDRESS = 'UPDATE_USERADDRESS';
export const RESET_USERADDRESS = 'RESET_USERADDRESS';

export interface AddUserAddress {
  type: typeof ADD_USERADDRESS;
  data: any;
}

export interface UpdateUserAddress {
  type: typeof UPDATE_USERADDRESS;
  data: any;
}

export interface ResetUserAddress {
  type: typeof RESET_USERADDRESS;
}

export type UserAddressActionTypes = AddUserAddress | UpdateUserAddress | ResetUserAddress;

export function adduserAddress(data: any): AddUserAddress {
  return { type: ADD_USERADDRESS, data }
}

export function updateuserAddress(data: any): UpdateUserAddress {
  return { type: UPDATE_USERADDRESS, data }
}

export function resetuserAddress(): ResetUserAddress {
  return { type: RESET_USERADDRESS }
}
