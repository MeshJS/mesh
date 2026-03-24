import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaTxParserTxTester } from "~/data/links-txparser";
import TxParserInitializeTxParser from "../basics/initialize-txparser";
import TxParserInterpretResult from "./interpret-results";
import TxParserTestingInputs from "./testing-inputs";
import TxParserTestingMints from "./testing-mints";
import TxParserTestingOutputs from "./testing-outputs";
import TxParserTestingSignature from "./testing-signature";
import TxParserTestingTime from "./testing-time";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Initialize Tx Parser", to: "initializeTxParser" },
    { label: "Interpret Result", to: "interpretResult" },
    { label: "Testing Inputs", to: "testingInputs" },
    { label: "Testing Outputs", to: "testingOutputs" },
    { label: "Testing Mints", to: "testingMints" },
    { label: "Testing Time", to: "testingTime" },
    { label: "Testing Signature", to: "testingSignature" },
  ];

  return (
    <>
      <Metatags
        title={metaTxParserTxTester.title}
        description={metaTxParserTxTester.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaTxParserTxTester.title}
          description={metaTxParserTxTester.desc}
          heroicon={metaTxParserTxTester.icon}
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
        <TxParserInterpretResult />
        <TxParserTestingInputs />
        <TxParserTestingOutputs />
        <TxParserTestingMints />
        <TxParserTestingTime />
        <TxParserTestingSignature />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
