import { HydraProvider } from "./hydra-provider";

/**
 * todo: implement https://hydra.family/head-protocol/docs/tutorial/
 */
export class HydraInstance {
  private _provider: HydraProvider;

  constructor({ provider }: { provider: HydraProvider }) {
    this._provider = provider;
  }

  /**
   * needed?
   */
  async openHead() {}

  /**
   * https://hydra.family/head-protocol/docs/how-to/commit-blueprint/
   * @returns
   */
  async commitFunds() {
    return "txHash";
  }

  /**
   * https://hydra.family/head-protocol/docs/how-to/incremental-decommit
   * @returns
   */
  async decommitFunds() {
    return "txHash";
  }
}
