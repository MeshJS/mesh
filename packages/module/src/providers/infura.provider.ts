import axios, { AxiosInstance } from 'axios';
import { IUploader } from '@mesh/common/contracts';
import { parseHttpError } from '@mesh/common/utils';

export class InfuraProvider implements IUploader {
  private _axiosInstance!: AxiosInstance;

  constructor(
    projectId: string,
    projectSecret: string,
    options: Partial<CreateInfuraProviderOptions>
  ) {
    const host = options.host ?? 'ipfs.infura.io';
    const port = options.port ?? 5001;
    const version = options.version ?? 0;

    this._axiosInstance = axios.create({
      baseURL: `https://${host}:${port}/api/v${version}`,
      headers: { auth: `${projectId}:${projectSecret}` },
    });
  }

  // https://docs.infura.io/infura/networks/ipfs/http-api-methods/add
  async uploadContent(content: FormData): Promise<string> {
    try {
      const headers = { 'Content-Type': 'multipart/form-data' };
      const { data, status } = await this._axiosInstance.post(`add`, content, {
        headers,
      });

      if (status === 200) return data as string;

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }
}

type CreateInfuraProviderOptions = {
  host: string;
  port: number;
  version: number;
};
