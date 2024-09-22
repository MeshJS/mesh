
// createPost.ts
import { ADD_CREATEPOST, UPDATE_CREATEPOST, RESET_CREATEPOST, CreatePostActionTypes } from '../actions/createPost';

const initialState: any[] = [];

function createPost(state = initialState, action: CreatePostActionTypes): any[] {
  switch (action.type) {
    case ADD_CREATEPOST:
      return [...state, action.data];
    case UPDATE_CREATEPOST:
      return state.map(item => item.id === action.data.id ? action.data : item);
    case RESET_CREATEPOST:
      return [];
    default:
      return state;
  }
}

export default createPost;
