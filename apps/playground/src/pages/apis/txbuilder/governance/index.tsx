import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaTxbuilderGovernance } from "~/data/links-txbuilders";
import { Intro } from "../common";
import GovernanceRegistration from "./registration";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    // { label: "Send lovelace", to: "sendLovelace" },
  ];

  return (
    <>
      <Metatags
        title={metaTxbuilderGovernance.title}
        description={metaTxbuilderGovernance.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaTxbuilderGovernance.title}
          description={metaTxbuilderGovernance.desc}
          heroicon={metaTxbuilderGovernance.icon}
        >
          <p>Governance</p>
          <Intro />
          <p>
            This page list the governance transactions that can be created using
            the Mesh SDK.
          </p>
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/transactions/classes/Transaction" />

        <GovernanceRegistration />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
