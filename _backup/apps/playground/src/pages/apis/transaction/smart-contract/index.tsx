import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaSmartContract } from "~/data/links-smart-contracts";
import { Intro } from "../common";
import MintingPlutusScript from "../minting/minting-plutus-script";
import ContractApplyParamToScript from "./apply-param-to-script";
import ContractDesigningDatum from "./designing-datum";
import ContractInlineDatum from "./inline-datum";
import ContractLockAssets from "./lock-assets";
import ContractReferenceScript from "./reference-script";
import ContractUnlockAssets from "./unlock-assets";
import ContractUsingRedeemer from "./using-redeemer";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Lock assets", to: "lockAssets" },
    { label: "Unlock assets", to: "unlockAssets" },
    { label: "Minting assets", to: "mintingPlutusScript" },
    { label: "Apply param to script", to: "applyParamToScript" },
    { label: "Inline datum", to: "inlineDatum" },
    { label: "Reference script", to: "referenceScript" },
    { label: "Designing datum", to: "datum" },
    { label: "Using redeemer", to: "redeemer" },
  ];

  return (
    <>
      <Metatags
        title={metaSmartContract.title}
        description={metaSmartContract.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaSmartContract.title}
          description={metaSmartContract.desc}
          heroicon={metaSmartContract.icon}
        >
          <p>
            Cardano introduced smart contract support in 2021, which allowed the
            creation of a number of decentralised applications.
          </p>
          <Intro />
          <p>
            In this page, we will demonstrate various ways to interact with
            smart contracts.
          </p>
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/transactions/classes/Transaction" />

        <ContractLockAssets />
        <ContractUnlockAssets />
        <MintingPlutusScript />
        <ContractApplyParamToScript />
        <ContractInlineDatum />
        <ContractReferenceScript />
        <ContractDesigningDatum />
        <ContractUsingRedeemer />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
