
// getContentData.ts
export const ADD_GETCONTENTDATA = 'ADD_GETCONTENTDATA';
export const UPDATE_GETCONTENTDATA = 'UPDATE_GETCONTENTDATA';
export const RESET_GETCONTENTDATA = 'RESET_GETCONTENTDATA';

export interface AddGetContentData {
  type: typeof ADD_GETCONTENTDATA;
  data: any;
}

export interface UpdateGetContentData {
  type: typeof UPDATE_GETCONTENTDATA;
  data: any;
}

export interface ResetGetContentData {
  type: typeof RESET_GETCONTENTDATA;
}

export type GetContentDataActionTypes = AddGetContentData | UpdateGetContentData | ResetGetContentData;

export function addGetContentData(data: any): AddGetContentData {
  return { type: ADD_GETCONTENTDATA, data }
}

export function updateGetContentData(data: any): UpdateGetContentData {
  return { type: UPDATE_GETCONTENTDATA, data }
}

export function resetGetContentData(): ResetGetContentData {
  return { type: RESET_GETCONTENTDATA }
}
