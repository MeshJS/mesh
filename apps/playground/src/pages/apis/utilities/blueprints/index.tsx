import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import { metaBlueprints } from "~/data/links-utilities";
import MintingBluePrint from "./minting-blueprint";
import SpendingBluePrint from "./spending-blueprint";
import WithdrawalBluePrint from "./withdrawal-blueprint";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Spending Script Blueprint", to: "spendingScriptbluePrint" },
    { label: "Minting Script Blueprint", to: "mintingScriptBlueprint" },
    { label: "Withdrawal Script Blueprint", to: "withdrawalScriptBlueprint" },
  ];

  return (
    <>
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaBlueprints.title}
          description={metaBlueprints.desc}
          heroicon={metaBlueprints.icon}
        >
          <>
            In Mesh, we have in built <code>Blueprint</code> utility classes to
            help manipulating serialization and deserialization logic around
            Cardano smart contracts / validators. Now it is supporting the basic
            use case around 3 purposes - <code>Spending</code>,
            <code>Minting</code> and <code>Withdrawal</code>. You can either
            directly use the <code>Blueprint</code> utility classes imported
            from Mesh, or use the {` `}
            <a href="https://marketplace.visualstudio.com/items?itemName=sidan-lab.cardano-bar-vscode">
              {`Cardano Bar`}
            </a>{" "}
            from <a href="https://x.com/sidan_lab">SIDAN Lab</a>, which perform
            a comprehensive parsing of the CIP57 blueprint object into Mesh's
            type.
          </>
        </TitleIconDescriptionBody>

        <SpendingBluePrint />
        <MintingBluePrint />
        <WithdrawalBluePrint />
      </SidebarFullwidth>
    </>
  );
};
export default ReactPage;
