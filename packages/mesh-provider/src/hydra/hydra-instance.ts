import { HydraProvider } from "./hydra-provider";

/**
 * todo: implement https://hydra.family/head-protocol/docs/tutorial/
 */
export class HydraInstance {
  provider: HydraProvider;

  constructor({ provider }: { provider: HydraProvider }) {
    this.provider = provider;
  }

  /**
   * needed?
   */
  async openHead() {}

  /**
   * https://hydra.family/head-protocol/docs/how-to/commit-blueprint/
   *
   * If you don't want to commit any funds and only want to receive on layer two, you can request an empty commit transaction.:
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
