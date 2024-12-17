import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaAppwallet } from "~/data/links-wallets";
import AppWalletGenerateWallet from "./generate-wallet";
import AppWalletGetEnterpriseAddress from "./get-enterprise-address";
import AppWalletGetNetworkId from "./get-networkid";
import AppWalletGetPaymentAddress from "./get-payment-address";
import AppWalletGetRewardAddress from "./get-reward-address";
import AppwWalletLoadWallet from "./load-wallet";
import AppWalletSignData from "./sign-data";
import AppWalletSignTx from "./sign-tx";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Generate wallet", to: "generateWallet" },
    { label: "Load wallet", to: "loadWallet" },
    { label: "Get payment address", to: "getPaymentAddress" },
    { label: "Get enterprise address", to: "getEnterpriseAddress" },
    { label: "Get reward address", to: "getRewardAddress" },
    { label: "Get network ID", to: "getNetworkId" },
    { label: "Sign transactions", to: "signTx" },
    { label: "Sign data", to: "signData" },
  ];

  return (
    <>
      <Metatags title={metaAppwallet.title} description={metaAppwallet.desc} />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaAppwallet.title}
          description={metaAppwallet.desc}
          heroicon={metaAppwallet.icon}
        >
          <p>
            <code>AppWallet</code> has been deprecated and will be removed in
            the next major release. Please use{" "}
            <Link href="/apis/wallets/meshwallet">
              <code>MeshWallet</code>
            </Link>{" "}
            instead.
          </p>
          <p>
            <code>AppWallet</code> is useful for building other user wallets and
            fully customed applications's backend.
          </p>
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/wallets/classes/AppWallet" />

        <AppWalletGenerateWallet />
        <AppwWalletLoadWallet />
        <AppWalletGetPaymentAddress />
        <AppWalletGetEnterpriseAddress />
        <AppWalletGetRewardAddress />
        <AppWalletGetNetworkId />
        <AppWalletSignTx />
        <AppWalletSignData />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
