import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaAikenFirstScript } from "~/data/links-aiken";
import { getPageLinks } from "../common";
import AikenBuildScript from "./build";
import AikenFirstScript from "./script";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags
        title={metaAikenFirstScript.title}
        description={metaAikenFirstScript.desc}
      />
      <SidebarFullwidth sidebarItems={getPageLinks()}>
        <TitleIconDescriptionBody
          title={metaAikenFirstScript.title}
          description={metaAikenFirstScript.desc}
        >
          <></>
        </TitleIconDescriptionBody>

        <AikenFirstScript />
        <AikenBuildScript />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
