import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaTxbuilderBasic } from "~/data/links-txbuilders";
import { Intro } from "../common";
import TxbuilderBuildWithObject from "./build-with-object";
import TxbuilderCip20 from "./cip20";
import TxbuilderInitializeTxbuilder from "./initialize-txbuilder";
import TxbuilderMultisig from "./multisig";
import TxbuilderSendValues from "./send-values";
import TxbuilderSetRequiredSigners from "./set-required-signers";
import TxbuilderSetTime from "./set-time";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Initialize Tx Builder", to: "initializeTxbuilder" },
    { label: "Send value", to: "sendValue" },
    { label: "Multi-signature", to: "multisig" },
    { label: "Build with object", to: "buildWithObject" },
    { label: "Set metadata", to: "cip20" },
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
            <Intro />
            <p>
              The <code>MeshTxBuilder</code> is a powerful interface where the
              higher level <code>Transaction</code> class is indeed a pre-built
              combination of the <code>MeshTxBuilder</code> APIs. With these
              lower level APIs, it builds the object to be passing to the
              serialization libraries like{" "}
              <Link href="https://github.com/input-output-hk/cardano-js-sdk">
                cardano-sdk
              </Link>
              {" and "}
              <Link href="https://whisky.sidan.io">Whisky SDK</Link> to
              construct transactions.
            </p>
            <p>
              In this page, we will cover how to initialize the{" "}
              <code>MeshTxBuilder</code> and the basic operations of building a
              transaction.
            </p>
          </>
        </TitleIconDescriptionBody>

        <TxbuilderInitializeTxbuilder />
        {/* <TxbuilderCommonFunctions /> */}
        <TxbuilderSendValues />
        <TxbuilderMultisig />
        <TxbuilderBuildWithObject />
        {/* <TxbuilderSetMetadata /> */}
        <TxbuilderCip20 />
        {/* <TxbuilderSetCollateral /> */}
        <TxbuilderSetRequiredSigners />
        <TxbuilderSetTime />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
