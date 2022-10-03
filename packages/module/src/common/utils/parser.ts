import axios from 'axios';

export const parseHttpError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      return JSON.stringify({
        data: error.response.data,
        headers: error.response.headers,
        status: error.response.status,
      });
    } else if (error.request) {
      return JSON.stringify(error.request);
    } else {
      return error.message;
    }
  } else {
    return JSON.stringify(error);
  }
};
