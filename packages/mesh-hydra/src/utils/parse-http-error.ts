import axios from "axios";

export const parseHttpError = (error: unknown): string => {
  if (!axios.isAxiosError(error)) {
    return JSON.stringify(error);
  }

  if (error.response) {
    return JSON.stringify({
      data: error.response.data,
      headers: error.response.headers,
      status: error.response.status,
    });
  }

  if (error.request && !(error.request instanceof XMLHttpRequest)) {
    return JSON.stringify(error.request);
  }

  return JSON.stringify({ code: error.code, message: error.message });
};
