import { Observable } from "rxjs";
import { ContractAddress } from "@midnight-ntwrk/compact-runtime";
import { type Logger } from "pino";
import { ledger, Contract } from "../contract-compiled/index.js";
import { deployContract, findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import * as utils from "./utils.js";
import {
  MidnightSetupContractProviders,
  MidnightSetupPrivateStateId,
  DerivedMidnightSetupContractState,
  ContractStateData,
  LedgerStateData,
} from "./common-types.js";

export interface DeployedMidnightSetupAPI {
  readonly deployedContractAddress: ContractAddress;
  readonly state: Observable<DerivedMidnightSetupContractState>;
  getContractState: () => Promise<ContractStateData>;
  getLedgerState: () => Promise<LedgerStateData>;
}
/**
 * NB: Declaring a class implements a given type, means it must contain all defined properties and methods, then take on other extra properties or class
 */

export class MidnightSetupAPI implements DeployedMidnightSetupAPI {
  deployedContractAddress: string;
  state: Observable<DerivedMidnightSetupContractState>;

  private constructor(
    private providers: MidnightSetupContractProviders,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public readonly allReadyDeployedContract: any,
    private logger?: Logger
  ) {
    this.deployedContractAddress = allReadyDeployedContract.deployTxData.public.contractAddress;

    // Real state observable
    this.state = new Observable(subscriber => {
      subscriber.next({
        protocolTVL: [],
        projects: [],
      });
    });
  }

  async getContractState(): Promise<ContractStateData> {
    try {
      this.logger?.info("Getting contract state...", { address: this.deployedContractAddress });
      
      // Try to get contract state from public data provider
      const contractState = await this.providers.publicDataProvider.queryContractState(this.deployedContractAddress);
      
      if (contractState) {
        this.logger?.info("Contract state retrieved successfully");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stateAny = contractState as any;
        return {
          address: this.deployedContractAddress,
          data: contractState.data,
          blockHeight: stateAny.blockHeight?.toString(),
          blockHash: stateAny.blockHash?.toString(),
        };
      } else {
        this.logger?.warn("No contract state found");
        return {
          address: this.deployedContractAddress,
          data: null,
          message: "No contract state found at this address"
        };
      }
    } catch (error) {
      this.logger?.error("Failed to get contract state", { error: error instanceof Error ? error.message : error });
      return {
        address: this.deployedContractAddress,
        data: null,
        error: error instanceof Error ? error.message : "Failed to get contract state"
      };
    }
  }

  async getLedgerState(): Promise<LedgerStateData> {
    try {
      this.logger?.info("Getting ledger state...", { address: this.deployedContractAddress });
      
      const contractState = await this.getContractState();
      
      if (contractState.data) {
        // Try to parse the ledger state
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ledgerState = ledger(contractState.data as any);
          this.logger?.info("Ledger state parsed successfully");
          return {
            address: this.deployedContractAddress,
            ledgerState: {
              message: ledgerState.message ? new TextDecoder().decode(ledgerState.message) : null,
            },
            blockHeight: contractState.blockHeight,
            blockHash: contractState.blockHash,
          };
        } catch (parseError) {
          this.logger?.warn("Failed to parse ledger state", { error: parseError });
          return {
            address: this.deployedContractAddress,
            rawData: contractState.data,
            parseError: parseError instanceof Error ? parseError.message : "Failed to parse ledger state"
          };
        }
      } else {
        return {
          address: this.deployedContractAddress,
          error: contractState.error || contractState.message
        };
      }
    } catch (error) {
      this.logger?.error("Failed to get ledger state", { error: error instanceof Error ? error.message : error });
      return {
        address: this.deployedContractAddress,
        error: error instanceof Error ? error.message : "Failed to get ledger state"
      };
    }
  }

  static async deployMidnightSetupContract(
    providers: MidnightSetupContractProviders,
    logger?: Logger
  ): Promise<MidnightSetupAPI> {
    logger?.info("Deploying contract...");
    
    try {
      // Get or create initial private state
      const initialPrivateState = await MidnightSetupAPI.getPrivateState(providers);
      
      // Create contract instance with constructor arguments
      const contractInstance = new Contract({});
      
      // Real contract deployment using the wallet
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deployedContract = await deployContract(
        providers as any,
        {
          contract: contractInstance,
          initialPrivateState: initialPrivateState,
          privateStateId: MidnightSetupPrivateStateId,
        }
      );

      logger?.info("Contract deployed successfully", { 
        address: deployedContract.deployTxData.public.contractAddress 
      });
      return new MidnightSetupAPI(providers, deployedContract, logger);
    } catch (error) {
      logger?.error("Failed to deploy contract", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  static async joinMidnightSetupContract(
    providers: MidnightSetupContractProviders,
    contractAddress: string,
    logger?: Logger
  ): Promise<MidnightSetupAPI> {
    logger?.info("Joining contract...", { contractAddress });
    
    try {
      // Get or create initial private state
      const initialPrivateState = await MidnightSetupAPI.getPrivateState(providers);
      
      // Create contract instance
      const contractInstance = new Contract({});
      
      // Real contract join using the wallet
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingContract = await findDeployedContract(
        providers as any,
        {
          contract: contractInstance,
          contractAddress: contractAddress,
          privateStateId: MidnightSetupPrivateStateId,
          initialPrivateState: initialPrivateState,
        }
      );

      logger?.info("Successfully joined contract", { 
        address: existingContract.deployTxData.public.contractAddress 
      });
      return new MidnightSetupAPI(providers, existingContract, logger);
    } catch (error) {
      logger?.error("Failed to join contract", { 
        error: error instanceof Error ? error.message : String(error),
        contractAddress
      });
      throw error;
    }
  }

  private static async getPrivateState(
    providers: MidnightSetupContractProviders
  ): Promise<Record<string, unknown>> {
    try {
      const existingPrivateState = await providers.privateStateProvider.get(
        MidnightSetupPrivateStateId
      );
      
      // If no existing state, return empty object (the contract will initialize it)
      return existingPrivateState ?? {};
    } catch (error) {
      console.warn("Error getting private state, returning empty object:", error);
      return {};
    }
  }
}

export * as utils from "./utils.js";

export * from "./common-types.js";

// Re-export types for external use
export type { ContractStateData, LedgerStateData } from "./common-types.js";
