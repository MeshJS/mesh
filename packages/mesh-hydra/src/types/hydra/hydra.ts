export interface HydraHeadParameters {
  contestationPeriod: number;
  parties: HydraParty;
}

export type HydraParty = {
  vkey: string;
}[];
