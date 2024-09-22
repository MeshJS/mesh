
// account.ts
import { ADD_ACCOUNT, UPDATE_ACCOUNT, RESET_ACCOUNT, AccountActionTypes } from '../actions/account';

const initialState: any[] = [];

function account(state = initialState, action: AccountActionTypes): any[] {
  switch (action.type) {
    case ADD_ACCOUNT:
      return [...state, action.data];
    case UPDATE_ACCOUNT:
      return state.map(item => item.id === action.data.id ? action.data : item);
    case RESET_ACCOUNT:
      return [];
    default:
      return state;
  }
}

export default account;
