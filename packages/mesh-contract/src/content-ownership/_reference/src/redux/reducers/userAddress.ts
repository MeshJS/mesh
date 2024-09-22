
// userAddress.ts
import { ADD_USERADDRESS, UPDATE_USERADDRESS, RESET_USERADDRESS, UserAddressActionTypes } from '../actions/userAddress';

const initialState: any[] = [];

function userAddress(state = initialState, action: UserAddressActionTypes): any[] {
  switch (action.type) {
    case ADD_USERADDRESS:
      return [...state, action.data];
    case UPDATE_USERADDRESS:
      return state.map(item => item.id === action.data.id ? action.data : item);
    case RESET_USERADDRESS:
      return [];
    default:
      return state;
  }
}

export default userAddress;
