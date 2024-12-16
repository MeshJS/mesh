import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaHydraGettingStarted } from "~/data/links-hydra";
import { getPageLinks } from "../common";
import HydraInstallationInstructions from "./install";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags
        title={metaHydraGettingStarted.title}
        description={metaHydraGettingStarted.desc}
      />
      <SidebarFullwidth sidebarItems={getPageLinks()}>
        <TitleIconDescriptionBody
          title={metaHydraGettingStarted.title}
          description={metaHydraGettingStarted.desc}
        >
          <></>
        </TitleIconDescriptionBody>

        <HydraInstallationInstructions />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
