import axios from "axios";

import { parseHttpError } from "./utils";

/**
 * The BeginProvider class provides methods to query Begin ID.
 *
 * To use this provider, simply create a new instance of the BeginProvider class and call the desired method.
 *
 * ```typescript
 * import { BeginProvider } from "@meshsdk/core";
 *
 * const beginProvider = new BeginProvider();
 * ```
 */
export class BeginProvider {
  private readonly apikey: string;
  private readonly chainNumber = 1815;
  private readonly domainUrl = ".bgin.id";

  /**
   * Creates a new instance of the BeginProvider.
   * @param apikey The API key for querying Begin ID.
   */
  constructor(apikey?: string) {
    this.apikey = apikey ?? "31cab9edcc1c530e29924a56167d4ed17d50b7fds";
  }

  /**
   * Given a Begin ID, resolves the address and other information.
   * @param name name of Begin ID, e.g. `mesh`
   * @param url optional URL to override the default: https://resolveidaddress-ylo5dtxzdq-uc.a.run.app
   * @returns
   * - name: string
   * - domain: string
   * - image: string
   * - address: string
   */
  async resolveAddress(
    name: string,
    url?: string,
  ): Promise<{
    name: string;
    domain: string;
    image: string;
    address: string;
  }> {
    try {
      const axiosInstance = axios.create({
        baseURL: url ?? "https://resolveidaddress-ylo5dtxzdq-uc.a.run.app",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.apikey,
        },
      });

      const { data, status } = await axiosInstance.post(``, {
        name: name
          .replace("@", "")
          .replace(/(\.bgin\.id|\.beginid\.io|\.bgn\.is)$/, ""),
        chain: this.chainNumber,
      });

      if (status === 200) {
        const result = data.result;
        return {
          name: result.name,
          domain: `${"".concat(result.name, this.domainUrl)}`,
          image: result.image,
          address: result.addresses[this.chainNumber],
        };
      }

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * Given an address, resolves the Begin ID and other information.
   * @param address address to resolve
   * @param url optional URL to override the default: https://resolveIdReserveAddress-ylo5dtxzdq-uc.a.run.app
   * @returns
   * - name: string
   * - domain: string
   * - image: string
   * - address: string
   */
  async resolveAdressReverse(
    address: string,
    url?: string,
  ): Promise<{
    name: string;
    domain: string;
    image: string;
    address: string;
  }> {
    try {
      const axiosInstance = axios.create({
        baseURL:
          url ?? "https://resolveIdReserveAddress-ylo5dtxzdq-uc.a.run.app",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.apikey,
        },
      });

      const { data, status } = await axiosInstance.post(``, {
        address: address,
        chain: this.chainNumber,
      });

      if (status === 200) {
        const result = data.result;
        return {
          name: result.name,
          domain: `${"".concat(result.name, this.domainUrl)}`,
          image: result.image,
          address: result.addresses[this.chainNumber],
        };
      }

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }
}
