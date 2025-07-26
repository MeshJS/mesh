/* eslint-disable no-magic-numbers */
import { EstimatedFees } from './BitcoinWallet';
import { Network } from '../common/network';
import { FeeMarketProvider } from './FeeMarketProvider';
import axios, { AxiosInstance } from 'axios';
import { Logger } from 'ts-log';
import { DEFAULT_MARKETS, MIN_FEE_RATE } from './constants';

const satsPerVByteToBtcPerKB = (satsPerVByte: number): number => (satsPerVByte * 1000) / 100_000_000;

export class MempoolSpaceMarketProvider implements FeeMarketProvider {
  private readonly api: AxiosInstance;

  constructor(url: string, private readonly logger: Logger, private readonly network: Network = Network.Mainnet) {
    this.api = axios.create({
      baseURL: url
    });
  }

  async getFeeMarket(): Promise<EstimatedFees> {
    try {
      if (this.network === Network.Testnet) {
        return DEFAULT_MARKETS;
      }

      const response = await this.api.get('/api/v1/fees/recommended');

      const fastEstimate = response.data.fastestFee;
      const standardEstimate = response.data.halfHourFee;
      const slowEstimate = response.data.hourFee;

      return {
        fast: {
          feeRate: Math.max(satsPerVByteToBtcPerKB(fastEstimate), MIN_FEE_RATE),
          targetConfirmationTime: 600 // 10 minutes
        },
        standard: {
          feeRate: Math.max(satsPerVByteToBtcPerKB(standardEstimate), MIN_FEE_RATE),
          targetConfirmationTime: 1800 // 30 minutes
        },
        slow: {
          feeRate: Math.max(satsPerVByteToBtcPerKB(slowEstimate), MIN_FEE_RATE),
          targetConfirmationTime: 3600 // 60 minutes
        }
      };
    } catch (error) {
      this.logger.error('Failed to fetch fee market:', error);
    }

    return DEFAULT_MARKETS;
  }
}
