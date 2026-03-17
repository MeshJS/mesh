import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaNextjs } from "~/data/links-frameworks";
import { getPageLinks } from "../common";
import PlatformNextjsSetup from "./setup";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags title={metaNextjs.title} description={metaNextjs.desc} />
      <SidebarFullwidth sidebarItems={getPageLinks()}>
        <TitleIconDescriptionBody
          title={metaNextjs.title}
          description={metaNextjs.desc}
        >
          <></>
        </TitleIconDescriptionBody>
        <PlatformNextjsSetup />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
