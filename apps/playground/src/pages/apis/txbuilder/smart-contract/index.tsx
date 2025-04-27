import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import { metaTxbuilderSmartContract } from "~/data/links-txbuilders";
import { Intro } from "../common";
import TxbuilderContractPlutusMinting from "../minting/minting-plutus-script";
import TxbuilderContractLockAssets from "./lock-assets";
import TxbuilderContractSendReferenceScript from "./send-reference-script";
import TxbuilderContractUnlockAssets from "./unlock-assets";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Lock Assets", to: "TxbuilderContractLockAssets" },
    { label: "Unlock Assets", to: "TxbuilderContractUnlockAssets" },
    { label: "Plutus Minting", to: "mintingPlutusScript" },
    // { label: "Script withdrawal", to: "mintingPlutusScript" },
    {
      label: "Send Script Onchain",
      to: "TxbuilderContractSendReferenceScript",
    },
  ];

  let code = ``;
  code += `txBuilder\n`;
  code += `  .txInCollateral(txHash: string, txIndex: number, amount?: Asset[], address?: string)\n`;

  return (
    <>
      <Metatags
        title={metaTxbuilderSmartContract.title}
        description={metaTxbuilderSmartContract.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaTxbuilderSmartContract.title}
          description={metaTxbuilderSmartContract.desc}
          heroicon={metaTxbuilderSmartContract.icon}
        >
          <>
            <p>
              In this guide, you will understand all logics you need to know for
              interacting with smart contracts with <code>MeshTxBuilder</code>.
            </p>
            <Intro />
            <p>
              In Cardano, whenever you need the nodes' computing power to
              execute a smart contract, you need to provide collateral to
              prevent spamming. You will see this is everywhere when script
              execution is needed in below's examples, and here's how you can do
              so:
            </p>
            <Codeblock data={code} />
          </>
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/transactions/classes/MeshTxBuilder" />

        <TxbuilderContractLockAssets />
        <TxbuilderContractUnlockAssets />
        <TxbuilderContractPlutusMinting />
        <TxbuilderContractSendReferenceScript />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
