
// assetsList.ts
import { ADD_ASSETSLIST, UPDATE_ASSETSLIST, RESET_ASSETSLIST, AssetsListActionTypes } from '../actions/assetsList';

const initialState: any[] = [];

function assetsList(state = initialState, action: AssetsListActionTypes): any[] {
  switch (action.type) {
    case ADD_ASSETSLIST:
      return [...state, action.data];
    case UPDATE_ASSETSLIST:
      return state.map(item => item.id === action.data.id ? action.data : item);
    case RESET_ASSETSLIST:
      return [];
    default:
      return state;
  }
}

export default assetsList;
