import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaReactUicomponents } from "~/data/links-react";
import ReactConnectWallet from "./connect-wallet";
import ReactPoweredMesh from "./powered-mesh";
// import ReactStakeButton from "./stake-button";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Connect Wallet", to: "connectWallet" },
    // { label: "Stake ADA Button", to: "stakeButton" },
    { label: "Mesh Badge", to: "meshBadge" },
  ];

  return (
    <>
      <Metatags
        title={metaReactUicomponents.title}
        description={metaReactUicomponents.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaReactUicomponents.title}
          description={metaReactUicomponents.desc}
          heroicon={metaReactUicomponents.icon}
        >
          <p>
            Mesh provide a collection of useful UI components, so you can easily
            include web3 functionality and convenient utilities for your
            application.
          </p>
        </TitleIconDescriptionBody>

        <ReactConnectWallet />
        {/* <ReactStakeButton /> */}
        <ReactPoweredMesh />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
