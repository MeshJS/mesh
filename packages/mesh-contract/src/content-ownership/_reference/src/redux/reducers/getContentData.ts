
// getContentData.ts
import { ADD_GETCONTENTDATA, UPDATE_GETCONTENTDATA, RESET_GETCONTENTDATA, GetContentDataActionTypes } from '../actions/getContentData';

const initialState: any[] = [];

function getContentData(state = initialState, action: GetContentDataActionTypes): any[] {
  switch (action.type) {
    case ADD_GETCONTENTDATA:
      return [...state, action.data];
    case UPDATE_GETCONTENTDATA:
      return state.map(item => item.id === action.data.id ? action.data : item);
    case RESET_GETCONTENTDATA:
      return [];
    default:
      return state;
  }
}

export default getContentData;
