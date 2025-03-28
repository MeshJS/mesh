import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaMeshwallet } from "~/data/links-wallets";
import MeshWalletCreateCollateral from "./create-collateral";
import MeshWalletGenerateWallet from "./generate-wallet";
import MeshWalletGetAssets from "./get-assets";
import MeshWalletGetBalance from "./get-balance";
import MeshWalletGetChangeAddress from "./get-change-address";
import MeshWalletGetCollateral from "./get-collateral";
import MeshWalletGetDRep from "./get-drep";
import MeshWalletGetLovelace from "./get-lovelace";
import MeshWalletGetNetworkId from "./get-networkid";
import MeshWalletGetPolicyIdAssets from "./get-policyid-assets";
import MeshWalletGetPolicyIds from "./get-policyids";
import MeshWalletGetRewardAddresses from "./get-reward-addresses";
import MeshWalletGetUnusedAddresses from "./get-unused-addresses";
import MeshWalletGetUsedAddresses from "./get-used-addresses";
import MeshWalletGetUtxos from "./get-utxos";
import MeshWalletLoadWallet from "./load-wallet";
import MeshWalletSignData from "./sign-data";
import MeshWalletSignTx from "./sign-tx";
import MeshWalletSubmitTransaction from "./submit-tx";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Initialize wallet", to: "initWallet" },
    { label: "Generate wallet", to: "generateWallet" },
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
    { label: "Create collateral", to: "createCollateral" },
    { label: "Get assets", to: "getAssets" },
    { label: "Get lovelace", to: "getLovelace" },
    { label: "Get policy IDs", to: "getPolicyIds" },
    { label: "Get collection of assets", to: "getPolicyIdAssets" },
    { label: "Get DRep ID", to: "getDRep" },
  ];

  return (
    <>
      <Metatags
        title={metaMeshwallet.title}
        description={metaMeshwallet.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaMeshwallet.title}
          description={metaMeshwallet.desc}
          heroicon={metaMeshwallet.icon}
        >
          <p>
            Whether you are building a minting script, or an application that
            requires multi-signature, <code>MeshWallet</code> is all you need to
            get started.
          </p>
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/wallets/classes/MeshWallet" />

        <MeshWalletLoadWallet />
        <MeshWalletGenerateWallet />
        <MeshWalletGetBalance />
        <MeshWalletGetChangeAddress />
        <MeshWalletGetCollateral />
        <MeshWalletGetNetworkId />
        <MeshWalletGetRewardAddresses />
        <MeshWalletGetUnusedAddresses />
        <MeshWalletGetUsedAddresses />
        <MeshWalletGetUtxos />
        <MeshWalletSignData />
        <MeshWalletSignTx />
        <MeshWalletSubmitTransaction />
        <MeshWalletCreateCollateral />
        <MeshWalletGetAssets />
        <MeshWalletGetLovelace />
        <MeshWalletGetPolicyIds />
        <MeshWalletGetPolicyIdAssets />
        <MeshWalletGetDRep />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
