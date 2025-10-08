import useMidnightWallet from "@/hookes/useMidnightWallet";
import { MidnightSetupAPI, type DeployedMidnightSetupAPI } from "@meshsdk/midnight-setup";
import type { Logger } from "pino";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type PropsWithChildren,
} from "react";

export interface DeploymentProvider {
  readonly isJoining: boolean;
  readonly isDeploying: boolean;
  readonly error: string | null;
  readonly hasJoined: boolean;
  readonly hasDeployed: boolean;
  readonly midnightSetupApi: DeployedMidnightSetupAPI | undefined;
  readonly deployedContractAddress: string | undefined;
  onJoinContract: (address: string) => Promise<void>;
  onDeployContract: () => Promise<void>;
  clearError: () => void;
}

export const DeployedContractContext = createContext<DeploymentProvider | null>(null);

interface DeployedContractProviderProps extends PropsWithChildren {
  logger?: Logger;
}

const DeployedContractProvider = ({ 
  children, 
  logger
}: DeployedContractProviderProps) => {
  
  const [midnightSetupApi, setMidnightSetupApi] = useState<DeployedMidnightSetupAPI | undefined>(undefined);
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasJoined, setHasJoined] = useState<boolean>(false);
  const [hasDeployed, setHasDeployed] = useState<boolean>(false);
  const [deployedContractAddress, setDeployedContractAddress] = useState<string | undefined>(undefined);

  // Use the custom hook instead of useContext directly
  const walletContext = useMidnightWallet();

  const onJoinContract = useCallback(async (address: string) => {
    // Prevent multiple simultaneous joins
    if (isJoining || hasJoined || isDeploying || hasDeployed) return;
    
    // Validate requirements
    if (!walletContext?.walletState.hasConnected || !walletContext?.walletState.providers) {
      setError("Wallet must be connected before joining contract");
      return;
    }

    if (!address) {
      setError("Contract address is required");
      return;
    }

    setIsJoining(true);
    setError(null);

    try {
      const deployedAPI = await MidnightSetupAPI.joinMidnightSetupContract(
        walletContext.walletState.providers,
        address,
        logger
      );
      
      setMidnightSetupApi(deployedAPI);
      setHasJoined(true);
      setDeployedContractAddress(deployedAPI.deployedContractAddress);
      logger?.info("Successfully joined contract", { contractAddress: address });
      
    } catch (error) {
      const errMsg = error instanceof Error 
        ? error.message 
        : `Failed to join contract at ${address}`;
      setError(errMsg);
      logger?.error("Failed to join contract", { error: errMsg, contractAddress: address });
    } finally {
      setIsJoining(false);
    }
  }, [isJoining, hasJoined, isDeploying, hasDeployed, walletContext?.walletState.hasConnected, walletContext?.walletState.providers, logger]);

  const onDeployContract = useCallback(async () => {
    // Prevent multiple simultaneous operations
    if (isDeploying || hasDeployed || isJoining || hasJoined) return;
    
    // Validate requirements
    if (!walletContext?.walletState.hasConnected || !walletContext?.walletState.providers) {
      setError("Wallet must be connected before deploying contract");
      return;
    }

    setIsDeploying(true);
    setError(null);

    try {
      const deployedAPI = await MidnightSetupAPI.deployMidnightSetupContract(
        walletContext.walletState.providers,
        logger
      );
      
      setMidnightSetupApi(deployedAPI);
      setHasDeployed(true);
      setDeployedContractAddress(deployedAPI.deployedContractAddress);
      logger?.info("Successfully deployed new contract", { 
        contractAddress: deployedAPI.deployedContractAddress 
      });
      
    } catch (error) {
      const errMsg = error instanceof Error 
        ? error.message 
        : "Failed to deploy new contract";
      setError(errMsg);
      logger?.error("Failed to deploy contract", { error: errMsg });
    } finally {
      setIsDeploying(false);
    }
  }, [isDeploying, hasDeployed, isJoining, hasJoined, walletContext?.walletState.hasConnected, walletContext?.walletState.providers, logger]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const contextValue: DeploymentProvider = {
    isJoining,
    isDeploying,
    hasJoined,
    hasDeployed,
    error,
    midnightSetupApi,
    deployedContractAddress,
    onJoinContract,
    onDeployContract,
    clearError,
  };

  return (
    <DeployedContractContext.Provider value={contextValue}>
      {children}
    </DeployedContractContext.Provider>
  );
};

// Custom hook for consuming the context
export const useDeployedContract = (): DeploymentProvider => {
  const context = useContext(DeployedContractContext);
  
  if (!context) {
    throw new Error("useDeployedContract must be used within a DeployedContractProvider");
  }
  
  return context;
};

export default DeployedContractProvider;