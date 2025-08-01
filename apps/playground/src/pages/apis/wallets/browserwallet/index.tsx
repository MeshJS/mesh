import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaBrowserwallet } from "~/data/links-wallets";
import BrowserWalletConnectWallet from "./connect-wallet";
import BrowserWalletGetAssets from "./get-assets";
import BrowserWalletGetAvailableWallets from "./get-available-wallets";
import BrowserWalletGetBalance from "./get-balance";
import BrowserWalletGetChangeAddress from "./get-change-address";
import BrowserWalletGetCollateral from "./get-collateral";
import BrowserWalletGetExtensions from "./get-extensions";
import BrowserWalletGetLovelace from "./get-lovelace";
import BrowserWalletGetNetworkId from "./get-networkid";
import BrowserWalletGetPolicyIdAssets from "./get-policyid-assets";
import BrowserWalletGetPolicyIds from "./get-policyids";
import BrowserWalletGetDRep from "./get-drep";
import BrowserWalletGetRegisteredpubstakekeys from "./get-registeredpubstakekeys";
import BrowserWalletGetRewardAddresses from "./get-reward-addresses";
import BrowserWalletGetSupportedExtensions from "./get-supported-extensions";
import BrowserWalletGetUnregisteredPubStakeKeys from "./get-unregisteredpubstakekeys";
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

    { label: "Get supported extensions", to: "getSupportedExtensions" },
    { label: "Get extensions", to: "getExtensions" },
    { label: "Get DRep ID", to: "getDRep" },
    { label: "Get registered stakekeys", to: "getRegisteredpubstakekeys" },
    {
      label: "Get unregistered stakekeys",
      to: "getUnregisteredPubStakeKeys",
    },
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
            <code>BrowserWallet</code> provides APIs for interacting with
            browser-based wallets in accordance with{" "}
            <Link href="https://cips.cardano.org/cip/CIP-30">CIP-30</Link>. This
            standard defines the communication protocol between applications and
            user wallets, ensuring compatibility and security.
          </p>
          <p>
            In addition to the CIP-30 APIs, <code>BrowserWallet</code> includes
            utility functions that simplify common tasks such as retrieving wallet
            balances, signing transactions, and managing UTXOs.
          </p>
          <p>
            This section allows you to explore and test the available APIs for
            browser wallets, enabling seamless integration into your applications.
          </p>
        </TitleIconDescriptionBody>

        <ButtonFloatDocumentation href="https://docs.meshjs.dev/wallets/classes/BrowserWallet" />

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

        <BrowserWalletGetSupportedExtensions />
        <BrowserWalletGetExtensions />
        <BrowserWalletGetDRep />
        <BrowserWalletGetRegisteredpubstakekeys />
        <BrowserWalletGetUnregisteredPubStakeKeys />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
