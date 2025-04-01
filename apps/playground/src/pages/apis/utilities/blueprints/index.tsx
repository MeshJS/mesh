import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";

import { metaBluePrints } from "~/data/links-utilities";


import SpendingBluePrint from "./spending";
import MintingBluePrint from "./minting";
import WithdrawalBluePrint from "./withdrawal";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    {label: "Spending Script Blueprint", to: "SpendingScriptBlueprint" },
    {label: "Minting Script Blueprint", to: "MintingScriptBlueprint" },
    {label: "Withdrawal Script Blueprint", to: "WithdrawalScriptBlueprint" },
  ];

  return (
    <>
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
        title={metaBluePrints.title}
        description={metaBluePrints.desc}
        heroicon={metaBluePrints.icon}
        >
          <></>
        </TitleIconDescriptionBody> 

        <WithdrawalBluePrint />
        <MintingBluePrint />
        <SpendingBluePrint />
      </SidebarFullwidth>
    </>
  );
};
export default ReactPage;
