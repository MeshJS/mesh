export type BlockInfo = {
  time: number;
  hash: string;
  slot: string;
  epoch: number;
  epochSlot: string;
  slotLeader: string;
  size: number;
  txCount: number;
  output: string;
  fees: string;
  previousBlock: string;
  nextBlock: string;
  confirmations: number;
  operationalCertificate: string;
  VRFKey: string;
  /** The block number, an integer from 0; left out by a provider that does not report it */
  height?: number;
};
