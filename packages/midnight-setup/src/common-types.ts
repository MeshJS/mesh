import type { 
  PrivateStateProvider, 
  ZKConfigProvider, 
  ProofProvider, 
  PublicDataProvider, 
  WalletProvider, 
  MidnightProvider 
} from "@midnight-ntwrk/midnight-js-types";

// Private state identifier for the contract
export const MidnightSetupPrivateStateId = "midnight-setup-private-state";
export type MidnightSetupPrivateStateId = typeof MidnightSetupPrivateStateId;

// Circuit keys type for proof provider
export type TokenCircuitKeys = string;

// Contract providers interface with proper types
export interface MidnightSetupContractProviders {
  privateStateProvider: PrivateStateProvider;
  zkConfigProvider: ZKConfigProvider<TokenCircuitKeys>;
  proofProvider: ProofProvider<TokenCircuitKeys>;
  publicDataProvider: PublicDataProvider;
  walletProvider: WalletProvider;
  midnightProvider: MidnightProvider;
}

// Contract state types - using unknown for flexible state data
export interface ContractStateData {
  readonly address: string;
  readonly data: unknown;
  readonly blockHeight?: string;
  readonly blockHash?: string;
  readonly message?: string;
  readonly error?: string;
}

export interface LedgerStateData {
  readonly address: string;
  readonly ledgerState?: {
    readonly message: string | null;
  };
  readonly blockHeight?: string;
  readonly blockHash?: string;
  readonly rawData?: unknown;
  readonly parseError?: string;
  readonly error?: string;
}

export type DerivedMidnightSetupContractState = {
  readonly protocolTVL: unknown[];
  readonly projects: unknown[];
};
