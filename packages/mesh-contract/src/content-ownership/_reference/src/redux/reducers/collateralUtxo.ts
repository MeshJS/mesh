
// collateralUtxo.ts
import { ADD_COLLATERALUTXO, UPDATE_COLLATERALUTXO, RESET_COLLATERALUTXO, CollateralUtxoActionTypes } from '../actions/collateralUtxo';

const initialState: any[] = [];

function collateralUtxo(state = initialState, action: CollateralUtxoActionTypes): any[] {
  switch (action.type) {
    case ADD_COLLATERALUTXO:
      return [...state, action.data];
    case UPDATE_COLLATERALUTXO:
      return state.map(item => item.id === action.data.id ? action.data : item);
    case RESET_COLLATERALUTXO:
      return [];
    default:
      return state;
  }
}

export default collateralUtxo;
