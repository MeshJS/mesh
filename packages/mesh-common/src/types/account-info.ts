export type AccountInfo = {
  active: boolean;
  poolId?: string;
  balance: string;
  rewards: string;
  withdrawals: string;
  /**
   * CIP-129 id of the DRep the stake address delegates its vote to, or `alwaysAbstain` /
   * `alwaysNoConfidence`; `null` when it delegates its vote to none. Left out when the provider
   * does not report it.
   */
  drep?: string | null;
  /** Deposit paid on registration, in lovelace, when the provider reports it */
  deposit?: string;
};
