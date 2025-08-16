import axios, { AxiosInstance, RawAxiosRequestHeaders } from "axios";

export class HTTPClient {
  constructor(private baseURL: string) {
    this._instance = axios.create({
      baseURL: this.baseURL,
    });
  }

  async get(endpoint: string, signal?: AbortSignal) {
    try {
      const { data, status } = await this._instance.get(endpoint, { signal });
      if (status === 200 || status == 202) return data;
      throw _parseError(data);
    } catch (error) {
      throw _parseError(error);
    }
  }

  async post(endpoint: string, payload: unknown, headers?: RawAxiosRequestHeaders, signal?: AbortSignal) {
    try {
      const { data, status } = await this._instance.post(endpoint, payload, {
        headers: headers ?? { "Content-Type": "application/json" }, signal,
      });
      if (status === 200 || status == 202) return data;
      throw _parseError(data);
    } catch (error) {
      throw _parseError(error);
    }
  }

  async delete(endpoint: string, headers?: RawAxiosRequestHeaders, signal?: AbortSignal) {
    try {
      const { data, status } = await this._instance.delete(endpoint, { headers, signal });
      if (status === 200 || status == 202) return data;
      throw _parseError(data);
    } catch (error) {
      throw _parseError(error);
    }
  }

  private readonly _instance: AxiosInstance;
}

function _parseError(error: unknown): string {
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
