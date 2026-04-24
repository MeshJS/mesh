import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaTxParserBasic } from "~/data/links-txparser";
import TxParserInitializeTxParser from "./initialize-txparser";
import TxParserRebuildTx from "./rebuild-tx";
import TxParseTxTester from "./tx-tester";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Initialize Tx Parser", to: "initializeTxParser" },
    { label: "Rebuild Transaction", to: "rebuildTx" },
    { label: "Unit Testing Tx", to: "txTester" },
  ];

  return (
    <>
      <Metatags
        title={metaTxParserBasic.title}
        description={metaTxParserBasic.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaTxParserBasic.title}
          description={metaTxParserBasic.desc}
          heroicon={metaTxParserBasic.icon}
        >
          <>
            <p>
              The <code>TxParser</code> is a tool where you can parse the
              typical transaction CBOR hex back into the{" "}
              <code>MeshTxBuilderBody</code>. With such capability, you can
              proceed with rebuilding a transaction or examing the with unit
              testing frameworks.
            </p>
            <p>
              In this page, we will cover how to initialize the{" "}
              <code>TxParser</code>.
            </p>
          </>
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/transactions/classes/MeshTxBuilder" />

        <TxParserInitializeTxParser />
        <TxParserRebuildTx />
        <TxParseTxTester />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
