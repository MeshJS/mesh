import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaTxbuilderBasic } from "~/data/links-txbuilders";
import TxbuilderBuildWithObject from "./build-with-object";
import TxbuilderCip20 from "./cip20";
import TxbuilderCommonFunctions from "./common-functions";
import TxbuilderInitializeTxbuilder from "./initialize-txbuilder";
import TxbuilderSendValues from "./send-values";
import TxbuilderSetCollateral from "./set-collateral";
import TxbuilderSetMetadata from "./set-metadata";
import TxbuilderSetRequiredSigners from "./set-required-signers";
import TxbuilderSetTime from "./set-time";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Initialize Tx Builder", to: "initializeTxbuilder" },
    { label: "Common functions", to: "commonFunctions" },
    { label: "Send value", to: "sendValue" },
    { label: "Build with object", to: "buildWithObject" },
    { label: "Set metadata", to: "metadata" },
    { label: "Set transaction message", to: "cip20" },
    { label: "Set collateral", to: "collateral" },
    { label: "Set required signers", to: "requiredSigners" },
    { label: "Set time", to: "setTime" },
  ];

  return (
    <>
      <Metatags
        title={metaTxbuilderBasic.title}
        description={metaTxbuilderBasic.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaTxbuilderBasic.title}
          description={metaTxbuilderBasic.desc}
          heroicon={metaTxbuilderBasic.icon}
        >
          <>
            <p>
              The <code>MeshTxBuilder</code> is a powerful low-level API that
              allows you to build and sign transactions. Under the hood, it
              interface with cardano-sdk and Whisky SDK to construct
              transactions.
            </p>
            <p>
              In this page, we will cover how to initialize the{" "}
              <code>MeshTxBuilder</code> and the basic operations of building a
              transaction.
            </p>
          </>
        </TitleIconDescriptionBody>

        <TxbuilderInitializeTxbuilder />
        <TxbuilderCommonFunctions />
        <TxbuilderSendValues />
        <TxbuilderBuildWithObject />
        <TxbuilderSetMetadata />
        <TxbuilderCip20 />
        <TxbuilderSetCollateral />
        <TxbuilderSetRequiredSigners />
        <TxbuilderSetTime />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
