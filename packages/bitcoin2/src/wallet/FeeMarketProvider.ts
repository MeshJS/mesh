import { EstimatedFees } from '../wallet/BitcoinWallet';

/**
 * Interface for providing a fee estimation strategy.
 *
 * Implementations of this interface are responsible for retrieving
 * current fee market data from a source and returning a normalized fee structure.
 */
export interface FeeMarketProvider {
  /**
   * Retrieves current fee estimates.
   *
   * @returns A promise resolving to the latest fee estimates.
   */
  getFeeMarket(): Promise<EstimatedFees>;
}
