
// createPost.ts
export const ADD_CREATEPOST = 'ADD_CREATEPOST';
export const UPDATE_CREATEPOST = 'UPDATE_CREATEPOST';
export const RESET_CREATEPOST = 'RESET_CREATEPOST';

export interface AddCreatePost {
  type: typeof ADD_CREATEPOST;
  data: any;
}

export interface UpdateCreatePost {
  type: typeof UPDATE_CREATEPOST;
  data: any;
}

export interface ResetCreatePost {
  type: typeof RESET_CREATEPOST;
}

export type CreatePostActionTypes = AddCreatePost | UpdateCreatePost | ResetCreatePost;

export function addcreatePost(data: any): AddCreatePost {
  return { type: ADD_CREATEPOST, data }
}

export function updatecreatePost(data: any): UpdateCreatePost {
  return { type: UPDATE_CREATEPOST, data }
}

export function resetcreatePost(): ResetCreatePost {
  return { type: RESET_CREATEPOST }
}
