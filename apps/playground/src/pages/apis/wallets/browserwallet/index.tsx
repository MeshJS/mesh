import type { NextPage } from "next";
import Link from "next/link";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaBrowserwallet } from "~/data/links-wallets";
import BrowserWalletConnectWallet from "./connect-wallet";
import BrowserWalletGetAssets from "./get-assets";
import BrowserWalletGetAvailableWallets from "./get-available-wallets";
import BrowserWalletGetBalance from "./get-balance";
import BrowserWalletGetChangeAddress from "./get-change-address";
import BrowserWalletGetCollateral from "./get-collateral";
import BrowserWalletGetLovelace from "./get-lovelace";
import BrowserWalletGetNetworkId from "./get-networkid";
import BrowserWalletGetPolicyIdAssets from "./get-policyid-assets";
import BrowserWalletGetPolicyIds from "./get-policyids";
import BrowserWalletGetRewardAddresses from "./get-reward-addresses";
import BrowserWalletGetUnusedAddresses from "./get-unused-addresses";
import BrowserWalletGetUsedAddresses from "./get-used-addresses";
import BrowserWalletGetUtxos from "./get-utxos";
import BrowserWalletSignData from "./sign-data";
import BrowserWalletSignTx from "./sign-tx";
import BrowserWalletSubmitTransaction from "./submit-tx";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Get available wallets", to: "getAvailableWallets" },
    { label: "Connect wallet", to: "connectWallet" },
    { label: "Get balance", to: "getBalance" },
    { label: "Get change address", to: "getChangeAddress" },
    { label: "Get collateral", to: "getCollateral" },
    { label: "Get network ID", to: "getNetworkId" },
    { label: "Get reward addresses", to: "getRewardAddresses" },
    { label: "Get unused addresses", to: "getUnusedAddresses" },
    { label: "Get used addresses", to: "getUsedAddresses" },
    { label: "Get UTXOs", to: "getUtxos" },
    { label: "Sign data", to: "signData" },
    { label: "Sign transaction", to: "signTx" },
    { label: "Submit transaction", to: "submitTx" },
    { label: "Get assets", to: "getAssets" },
    { label: "Get lovelace", to: "getLovelace" },
    { label: "Get policy IDs", to: "getPolicyIds" },
    { label: "Get collection of assets", to: "getPolicyIdAssets" },
  ];

  return (
    <>
      <Metatags
        title={metaBrowserwallet.title}
        description={metaBrowserwallet.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaBrowserwallet.title}
          description={metaBrowserwallet.desc}
          heroicon={metaBrowserwallet.icon}
        >
          <p>
            These wallets APIs are in accordance to{" "}
            <Link
              href="https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030"
              target="_blank"
              rel="noreferrer"
            >
              CIP-30
            </Link>
            , which defines the API for dApps to communicate with the user's
            wallet. Additional utility functions provided for developers that
            are useful for building dApps.
          </p>

          <p>
            In this section, you can connect wallet and try APIs for dApps to
            communicate with your wallet.
          </p>
        </TitleIconDescriptionBody>

        <BrowserWalletGetAvailableWallets />
        <BrowserWalletConnectWallet />
        <BrowserWalletGetBalance />
        <BrowserWalletGetChangeAddress />
        <BrowserWalletGetCollateral />
        <BrowserWalletGetNetworkId />
        <BrowserWalletGetRewardAddresses />
        <BrowserWalletGetUnusedAddresses />
        <BrowserWalletGetUsedAddresses />
        <BrowserWalletGetUtxos />
        <BrowserWalletSignData />
        <BrowserWalletSignTx />
        <BrowserWalletSubmitTransaction />
        <BrowserWalletGetAssets />
        <BrowserWalletGetLovelace />
        <BrowserWalletGetPolicyIds />
        <BrowserWalletGetPolicyIdAssets />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
