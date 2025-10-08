import { StrictMode } from "react";
import './polyfills'
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import MidnightWalletProvider from "./providers/MidnightWalletProvider.tsx";
import DeployedContractProvider from "./providers/DeployedContractProvider.tsx";
import pino from "pino";
import { setNetworkId, type NetworkId } from "@midnight-ntwrk/midnight-js-network-id";

const networkId = import.meta.env.VITE_NETWORK_ID as NetworkId;
// Ensure that the network IDs are set within the Midnight libraries.
setNetworkId(networkId);

// Create a default `pino` logger and configure it with the configured logging level.
export const logger = pino({
  level: import.meta.env.VITE_LOGGING_LEVEL as string,
});

logger.trace('networkId = ', networkId);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MidnightWalletProvider logger={logger}>
      <DeployedContractProvider logger={logger}>
        <App />
      </DeployedContractProvider>
    </MidnightWalletProvider>
  </StrictMode>
);

