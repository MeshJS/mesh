import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaAikenGettingStarted } from "~/data/links-aiken";
import { getPageLinks } from "../common";
import AikenCommands from "./commands";
import AikenEditorintegrations from "./editors";
import AikenInstallationInstructions from "./install";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags
        title={metaAikenGettingStarted.title}
        description={metaAikenGettingStarted.desc}
      />
      <SidebarFullwidth sidebarItems={getPageLinks()}>
        <TitleIconDescriptionBody
          title={metaAikenGettingStarted.title}
          description={metaAikenGettingStarted.desc}
        >
          <></>
        </TitleIconDescriptionBody>

        <AikenInstallationInstructions />
        <AikenEditorintegrations />
        <AikenCommands />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
