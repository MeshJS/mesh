export const MIN_FEE_RATE = 0.000_011;

export const DEFAULT_MARKETS = {
  fast: {
    feeRate: 0.000_025,
    targetConfirmationTime: 1
  },
  standard: {
    feeRate: 0.000_015,
    targetConfirmationTime: 3
  },
  slow: {
    feeRate: 0.000_011,
    targetConfirmationTime: 6
  }
};
