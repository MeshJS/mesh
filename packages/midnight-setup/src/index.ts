import { ContractAddress } from "@midnight-ntwrk/compact-runtime";
import { type Logger } from "pino";
import { Observable } from "rxjs";

import {
  ContractInstance,
  ContractStateData,
  DeployedContract,
  DerivedMidnightSetupContractState,
  LedgerStateData,
  MidnightSetupContractProviders,
  MidnightSetupPrivateStateId,
  QueryContractState,
} from "./common-types.js";

export interface DeployedMidnightSetupAPI {
  readonly deployedContractAddress: ContractAddress;
  readonly state: Observable<DerivedMidnightSetupContractState>;
  getContractState: () => Promise<ContractStateData>;
  getLedgerState: () => Promise<LedgerStateData>;
}

export class MidnightSetupAPI implements DeployedMidnightSetupAPI {
  deployedContractAddress: string;
  state: Observable<DerivedMidnightSetupContractState>;

  private constructor(
    private providers: MidnightSetupContractProviders,
    public readonly deployedContract: DeployedContract,
    private logger?: Logger,
  ) {
    this.deployedContractAddress =
      deployedContract.deployTxData.public.contractAddress;

    this.state = new Observable((subscriber) => {
      subscriber.next({
        protocolTVL: [],
        projects: [],
      });
    });
  }

  async getContractState(): Promise<ContractStateData> {
    try {
      this.logger?.info("Getting contract state...", {
        address: this.deployedContractAddress,
      });

      const contractState =
        (await this.providers.publicDataProvider.queryContractState(
          this.deployedContractAddress,
        )) as QueryContractState | null;

      if (contractState) {
        this.logger?.info("Contract state retrieved successfully");
        return {
          address: this.deployedContractAddress,
          data: contractState.data,
          blockHeight: contractState.blockHeight?.toString(),
          blockHash:
            typeof contractState.blockHash === "string"
              ? contractState.blockHash
              : contractState.blockHash?.toString(),
        };
      } else {
        this.logger?.warn("No contract state found");
        return {
          address: this.deployedContractAddress,
          data: null,
          message: "No contract state found at this address",
        };
      }
    } catch (error) {
      this.logger?.error("Failed to get contract state", {
        error: error instanceof Error ? error.message : error,
      });
      return {
        address: this.deployedContractAddress,
        data: null,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get contract state",
      };
    }
  }

  async getLedgerState(): Promise<LedgerStateData> {
    try {
      this.logger?.info("Getting ledger state...", {
        address: this.deployedContractAddress,
      });

      const contractState = await this.getContractState();

      if (contractState.data) {
        try {
          // Generic ledger state parsing
          const ledgerState = contractState.data as Record<string, unknown>;
          this.logger?.info("Ledger state parsed successfully");

          // Parse message if it exists and is a Uint8Array
          let messageText: string | null = null;
          if (
            ledgerState.message &&
            ledgerState.message instanceof Uint8Array
          ) {
            messageText = new TextDecoder().decode(ledgerState.message);
          }

          return {
            address: this.deployedContractAddress,
            ledgerState: {
              message: messageText,
            },
            blockHeight: contractState.blockHeight,
            blockHash: contractState.blockHash,
          };
        } catch (parseError) {
          this.logger?.warn("Failed to parse ledger state", {
            error: parseError,
          });
          return {
            address: this.deployedContractAddress,
            rawData: contractState.data,
            parseError:
              parseError instanceof Error
                ? parseError.message
                : "Failed to parse ledger state",
          };
        }
      } else {
        return {
          address: this.deployedContractAddress,
          error: contractState.error || contractState.message,
        };
      }
    } catch (error) {
      this.logger?.error("Failed to get ledger state", {
        error: error instanceof Error ? error.message : error,
      });
      return {
        address: this.deployedContractAddress,
        error:
          error instanceof Error ? error.message : "Failed to get ledger state",
      };
    }
  }

  static async deployContract(
    providers: MidnightSetupContractProviders,
    contractInstance: ContractInstance,
    logger?: Logger,
  ): Promise<MidnightSetupAPI> {
    logger?.info("Deploying contract...");

    try {
      const initialPrivateState =
        await MidnightSetupAPI.getPrivateState(providers);

      const { deployContract } = await import(
        "@midnight-ntwrk/midnight-js-contracts"
      );

      const deployedContract = (await deployContract(providers, {
        contract: contractInstance,
        initialPrivateState: initialPrivateState,
        privateStateId: MidnightSetupPrivateStateId,
      })) as DeployedContract;

      logger?.info("Contract deployed successfully", {
        address: deployedContract.deployTxData.public.contractAddress,
      });
      return new MidnightSetupAPI(providers, deployedContract, logger);
    } catch (error) {
      logger?.error("Failed to deploy contract", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  static async joinContract(
    providers: MidnightSetupContractProviders,
    contractInstance: ContractInstance,
    contractAddress: string,
    logger?: Logger,
  ): Promise<MidnightSetupAPI> {
    logger?.info("Joining contract...", { contractAddress });

    try {
      const initialPrivateState =
        await MidnightSetupAPI.getPrivateState(providers);

      const { findDeployedContract } = await import(
        "@midnight-ntwrk/midnight-js-contracts"
      );

      const existingContract = (await findDeployedContract(providers, {
        contract: contractInstance,
        contractAddress: contractAddress,
        privateStateId: MidnightSetupPrivateStateId,
        initialPrivateState: initialPrivateState,
      })) as DeployedContract;

      logger?.info("Successfully joined contract", {
        address: existingContract.deployTxData.public.contractAddress,
      });
      return new MidnightSetupAPI(providers, existingContract, logger);
    } catch (error) {
      logger?.error("Failed to join contract", {
        error: error instanceof Error ? error.message : String(error),
        contractAddress,
      });
      throw error;
    }
  }

  private static async getPrivateState(
    providers: MidnightSetupContractProviders,
  ): Promise<Record<string, unknown>> {
    try {
      const existingPrivateState = await providers.privateStateProvider.get(
        MidnightSetupPrivateStateId,
      );

      return existingPrivateState ?? {};
    } catch (error) {
      console.warn(
        "Error getting private state, returning empty object:",
        error,
      );
      return {};
    }
  }
}

export * as utils from "./utils.js";
export * from "./common-types.js";

// Re-export main types for convenience
export type {
  ContractStateData,
  LedgerStateData,
  DeployedContract,
  ContractInstance,
  QueryContractState,
  MidnightSetupContractProviders,
  TokenCircuitKeys,
} from "./common-types.js";
