import { Axios } from "./axios.js";

export class Infura {
  private _instance: Axios;

  constructor() {}

  async init({
    projectId,
    projectSecret,
    ipfsApiEndpoint,
  }: {
    projectId: string;
    projectSecret: string;
    ipfsApiEndpoint?: string;
  }) {
    const headers = {
      auth: `${projectId}:${projectSecret}`,
    };
    this._instance = new Axios({
      baseURL: ipfsApiEndpoint ?? "https://ipfs.infura.io:5001/api/v0",
      headers: headers,
    });
  }

  /**
   * Add a file or directory to IPFS.
   * https://docs.infura.io/infura/networks/ipfs/http-api-methods/add
   * @returns
   */
  async addFileIpfs({ formData }): Promise<{}> {
    // return await this._instance.post({
    //   endpoint: "/add?",
    //   data: formData,
    //   headers: {
    //     "Content-Type": "multipart/form-data",
    //   },
    // });

    return await this._instance
      .post({
        endpoint: "/add?",
        data: formData,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      })
      .then(({ data }) => {
        return data;
      })
      .catch((error) => {
        throw error;
      });
  }
}
