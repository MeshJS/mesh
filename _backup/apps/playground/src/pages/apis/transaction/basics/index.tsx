import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaTransactionBasic } from "~/data/links-transactions";
import { Intro } from "../common";
import TransactionBegin from "./begin";
import TransactionCip20 from "./cip20";
import TransactionCoinSelection from "./coin-selection";
import TransactionGetTxbuilder from "./get-txbuilder";
import TransactionHandle from "./handle";
import TransactionMultisig from "./multisig";
import TransactionSendAssets from "./send-assets";
import TransactionSendLovelace from "./send-lovelace";
import TransactionSendValue from "./send-value";
import TransactionSetCollateral from "./set-collateral";
import TransactionSetMetadata from "./set-metadata";
import TransactionSetNetwork from "./set-network";
import TransactionSetRequiredSigners from "./set-required-signers";
import TransactionSetTime from "./set-time";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Send lovelace", to: "sendLovelace" },
    { label: "Send assets", to: "sendAssets" },
    { label: "Send value", to: "sendValue" },
    { label: "Multi-signature", to: "multisig" },

    { label: "Coin selection", to: "coinSelection" },

    { label: "Get txbuilder", to: "getTxbuilder" },

    { label: "ADA Handle", to: "handler" },
    { label: "Begin ID", to: "begin" },

    { label: "Set metadata", to: "metadata" },
    { label: "Set transaction message", to: "cip20" },

    { label: "Set collateral", to: "collateral" },
    { label: "Set required signers", to: "requiredSigners" },

    { label: "Set time", to: "setTime" },
    { label: "Set network", to: "setNetwork" },
  ];

  return (
    <>
      <Metatags
        title={metaTransactionBasic.title}
        description={metaTransactionBasic.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaTransactionBasic.title}
          description={metaTransactionBasic.desc}
          heroicon={metaTransactionBasic.icon}
        >
          <p>
            Transactions are used to send assets from one wallet to another and
            to smart contracts.
          </p>
          <Intro />
          <p>
            In this page, you will find the APIs to create transactions for
            sending assets and various options to customize the transaction.
          </p>
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/transactions/classes/Transaction" />

        <TransactionSendLovelace />
        <TransactionSendAssets />
        <TransactionSendValue />
        <TransactionMultisig />

        <TransactionCoinSelection />

        <TransactionGetTxbuilder />

        <TransactionHandle />
        <TransactionBegin />

        <TransactionSetMetadata />
        <TransactionCip20 />

        <TransactionSetCollateral />
        <TransactionSetRequiredSigners />

        <TransactionSetTime />
        <TransactionSetNetwork />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
