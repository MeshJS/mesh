import axios, { AxiosInstance } from 'axios/index';

export const createAxiosInstance = ({ baseURL, headers }: any): AxiosInstance => {
  return axios.create({
    baseURL: baseURL,
    headers: headers,
  });
};

export class Axios {
  private _instance: AxiosInstance;

  constructor({ baseURL, headers = {} }: { baseURL: string; headers: {} }) {
    this._instance = this._createAxiosInstance({ baseURL, headers });
  }

  _createAxiosInstance = ({ baseURL, headers }: any): AxiosInstance => {
    return axios.create({
      baseURL: baseURL,
      headers: headers,
    });
  };

  post = ({ endpoint, data, headers = {} }: any) => {
    return this._instance.post(endpoint, data, {
      headers: headers,
    });
  };

  get = ({ endpoint }: any) => {
    return this._instance.get(endpoint);
  };
}
