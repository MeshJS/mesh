
// walletList.ts
import { ADD_WALLETLIST, UPDATE_WALLETLIST, RESET_WALLETLIST, WalletListActionTypes } from '../actions/walletList';

const initialState: any[] = [];

function walletList(state = initialState, action: WalletListActionTypes): any[] {
  switch (action.type) {
    case ADD_WALLETLIST:
      return [...state, action.data];
    case UPDATE_WALLETLIST:
      return state.map(item => item.id === action.data.id ? action.data : item);
    case RESET_WALLETLIST:
      return [];
    default:
      return state;
  }
}

export default walletList;
