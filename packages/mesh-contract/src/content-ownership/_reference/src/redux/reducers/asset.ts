
// asset.ts
import { ADD_ASSET, UPDATE_ASSET, RESET_ASSET, AssetActionTypes } from '../actions/asset';

const initialState: any[] = [];

function asset(state = initialState, action: AssetActionTypes): any[] {
  switch (action.type) {
    case ADD_ASSET:
      return [...state, action.data];
    case UPDATE_ASSET:
      return state.map(item => item.id === action.data.id ? action.data : item);
    case RESET_ASSET:
      return [];
    default:
      return state;
  }
}

export default asset;
