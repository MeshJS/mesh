export type GovernanceProposalInfo = {
  txHash: string;
  certIndex: number;
  governanceType: string;
  deposit: number;
  returnAddress: string;
  governanceDescription: string;
  ratifiedEpoch: number;
  enactedEpoch: number;
  droppedEpoch: number;
  expiredEpoch: number;
  expiration: number;
  metadata: object;
};
