import { InfuraProvider, MaestroProvider } from "@meshsdk/core";
import axios from "axios";

const infuraProjectId = process.env.NEXT_PUBLIC_INFURA_PROJECT_ID!;
const infuraProjectSecret = process.env.NEXT_PUBLIC_INFURA_PROJECT_SECRET!;

export const infura = new InfuraProvider(infuraProjectId, infuraProjectSecret, {});

export const maestro = new MaestroProvider({ apiKey: process.env.NEXT_PUBLIC_MAESTRO_APIKEY!, network: "Preprod" });

export class InfuraDownloader {
  axiosInstance = axios.create({
    baseURL: "https://ipfs.infura.io:5001/api/v0",
    auth: { username: infuraProjectId, password: infuraProjectSecret },
  });

  async downloadContent(ipfsHash: string) {
    const content = await this.axiosInstance.post(`get?arg=${ipfsHash}`);
    return content;
  }
}
