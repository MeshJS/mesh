import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaMidnightGettingStarted } from "~/data/links-midnight";
import { getPageLinks } from "../common";
import MidnightInstallationInstructions from "./install";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags
        title={metaMidnightGettingStarted.title}
        description={metaMidnightGettingStarted.desc}
      />
      <SidebarFullwidth sidebarItems={getPageLinks()}>
        <TitleIconDescriptionBody
          title={metaMidnightGettingStarted.title}
          description={metaMidnightGettingStarted.desc}
        >
          <></>
        </TitleIconDescriptionBody>

        <MidnightInstallationInstructions />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
