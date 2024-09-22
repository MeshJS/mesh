
// feeUtxo.ts
import { ADD_FEEUTXO, UPDATE_FEEUTXO, RESET_FEEUTXO, FeeUtxoActionTypes } from '../actions/feeUtxo';

const initialState: any[] = [];

function feeUtxo(state = initialState, action: FeeUtxoActionTypes): any[] {
  switch (action.type) {
    case ADD_FEEUTXO:
      return [...state, action.data];
    case UPDATE_FEEUTXO:
      return state.map(item => item.id === action.data.id ? action.data : item);
    case RESET_FEEUTXO:
      return [];
    default:
      return state;
  }
}

export default feeUtxo;
