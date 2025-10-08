import type { MidnightSetupContractProviders, DeployedMidnightSetupAPI } from "../index";
import type { DAppConnectorWalletAPI, ServiceUriConfig } from "@midnight-ntwrk/dapp-connector-api";


export interface WalletAndProvider{
    readonly wallet: DAppConnectorWalletAPI,
    readonly uris: ServiceUriConfig,
    readonly providers: MidnightSetupContractProviders
}

export interface WalletAPI {
  wallet: DAppConnectorWalletAPI;
  coinPublicKey: string;
  encryptionPublicKey: string;
  uris: ServiceUriConfig;
}


export interface MidnightSetupDeployment{
  status: "inprogress" | "deployed" | "failed",
  api: DeployedMidnightSetupAPI;
}