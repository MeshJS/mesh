import { initialWalletAndProviders } from "@/lib/actions";
import type { WalletAPI } from "@/lib/common-types";
import type { MidnightSetupContractProviders } from "@meshsdk/midnight-setup";
import type { Logger } from "pino";
import {
  createContext,
  useReducer,
  useCallback,
  type PropsWithChildren,
} from "react";

export interface MidnightWalletState {
  readonly address: string | undefined;
  readonly isConnecting: boolean;
  readonly coinPublicKey: string | undefined;
  readonly providers: MidnightSetupContractProviders | undefined;
  readonly walletAPI: WalletAPI | undefined;
  readonly hasConnected: boolean;
  readonly error: string | null;
}

export interface MidnightWalletContextType {
  walletState: MidnightWalletState;
  connectToWalletAndInitializeProviders: () => Promise<void>;
  disconnect: () => void;
  clearError: () => void;
}

// Initial state
const initialState: MidnightWalletState = {
  address: undefined,
  isConnecting: false,
  coinPublicKey: undefined,
  providers: undefined,
  walletAPI: undefined,
  hasConnected: false,
  error: null,
};

// Action types
type WalletAction =
  | { type: "CONNECT_START" }
  | {
      type: "CONNECT_SUCCESS";
      payload: Omit<
        MidnightWalletState,
        "isConnecting" | "hasConnected" | "error"
      >;
    }
  | { type: "CONNECT_ERROR"; payload: string }
  | { type: "DISCONNECT" }
  | { type: "CLEAR_ERROR" };

// Reducer
function walletReducer(
  state: MidnightWalletState,
  action: WalletAction
): MidnightWalletState {
  switch (action.type) {
    case "CONNECT_START":
      return {
        ...state,
        isConnecting: true,
        error: null,
      };
    case "CONNECT_SUCCESS":
      return {
        ...state,
        ...action.payload,
        isConnecting: false,
        hasConnected: true,
        error: null,
      };
    case "CONNECT_ERROR":
      return {
        ...state,
        isConnecting: false,
        error: action.payload,
      };
    case "DISCONNECT":
      return {
        ...initialState,
        hasConnected: false,
      };
    case "CLEAR_ERROR":
      return {
        ...state,
        error: null,
      };
    default:
      return state;
  }
}

// Context
export const MidnightWalletContext =
  createContext<MidnightWalletContextType | null>(null);

// Provider Props
interface MidnightWalletProviderProps extends PropsWithChildren {
  logger?: Logger;
}

const MidnightWalletProvider = ({
  children,
  logger,
}: MidnightWalletProviderProps) => {
  const [walletState, dispatch] = useReducer(walletReducer, initialState);

  const connectToWalletAndInitializeProviders = useCallback(async () => {
    if (walletState.isConnecting) return; // Prevent multiple simultaneous connections

    dispatch({ type: "CONNECT_START" });

    try {
      const { wallet, uris, providers } = await initialWalletAndProviders();

      if (!wallet) {
        throw new Error("Failed to initialize wallet");
      }

      const walletStateData = await wallet.state();

      dispatch({
        type: "CONNECT_SUCCESS",
        payload: {
          address: walletStateData.address,
          coinPublicKey: walletStateData.coinPublicKey,
          providers,
          walletAPI: {
            wallet,
            uris,
            coinPublicKey: walletStateData.coinPublicKey,
            encryptionPublicKey: walletStateData.encryptionPublicKey,
          },
        },
      });
      
      logger?.info("Wallet connected successfully", {
        address: walletStateData.address,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to initialize wallet";
      dispatch({ type: "CONNECT_ERROR", payload: errorMessage });
      logger?.error("Wallet connection failed", { error: errorMessage });
    }
  }, [walletState.isConnecting, logger]);

  const disconnect = useCallback(() => {
    dispatch({ type: "DISCONNECT" });
    logger?.info("Wallet disconnected");
  }, [logger]);

  const clearError = useCallback(() => {
    dispatch({ type: "CLEAR_ERROR" });
  }, []);

  const contextValue: MidnightWalletContextType = {
    walletState,
    connectToWalletAndInitializeProviders,
    disconnect,
    clearError,
  };

  return (
    <MidnightWalletContext.Provider value={contextValue}>
      {children}
    </MidnightWalletContext.Provider>
  );
};

export default MidnightWalletProvider;
