
// account.ts
export const ADD_ACCOUNT = 'ADD_ACCOUNT';
export const UPDATE_ACCOUNT = 'UPDATE_ACCOUNT';
export const RESET_ACCOUNT = 'RESET_ACCOUNT';

export interface AddAccount {
  type: typeof ADD_ACCOUNT;
  data: any;
}

export interface UpdateAccount {
  type: typeof UPDATE_ACCOUNT;
  data: any;
}

export interface ResetAccount {
  type: typeof RESET_ACCOUNT;
}

export type AccountActionTypes = AddAccount | UpdateAccount | ResetAccount;

export function addaccount(data: any): AddAccount {
  return { type: ADD_ACCOUNT, data }
}

export function updateaccount(data: any): UpdateAccount {
  return { type: UPDATE_ACCOUNT, data }
}

export function resetaccount(): ResetAccount {
  return { type: RESET_ACCOUNT }
}
