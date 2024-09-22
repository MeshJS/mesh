
// walletAddress.ts
import { ADD_WALLETADDRESS, UPDATE_WALLETADDRESS, RESET_WALLETADDRESS, WalletAddressActionTypes } from '../actions/walletAddress';

const initialState: any[] = [];

function walletAddress(state = initialState, action: WalletAddressActionTypes): any[] {
  switch (action.type) {
    case ADD_WALLETADDRESS:
      return [...state, action.data];
    case UPDATE_WALLETADDRESS:
      return state.map(item => item.id === action.data.id ? action.data : item);
    case RESET_WALLETADDRESS:
      return [];
    default:
      return state;
  }
}

export default walletAddress;
