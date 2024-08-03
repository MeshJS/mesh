import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaTxbuilderSmartContract } from "~/data/links-txbuilders";
import TxbuilderContractPlutusMinting from "../minting/minting-plutus-script";
import TxbuilderContractLockAssets from "./lock-assets";
import TxbuilderContractUnlockAssets from "./unlock-assets";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Lock assets", to: "TxbuilderContractLockAssets" },
    { label: "Unlock assets", to: "TxbuilderContractUnlockAssets" },
    { label: "Plutus minting", to: "mintingPlutusScript" },
  ];

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
          <></>
        </TitleIconDescriptionBody>

        <TxbuilderContractLockAssets />
        <TxbuilderContractUnlockAssets />
        <TxbuilderContractPlutusMinting />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
