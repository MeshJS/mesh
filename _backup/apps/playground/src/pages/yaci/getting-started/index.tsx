import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaYaciGettingStarted } from "~/data/links-yaci";
import { getPageLinks } from "../common";
import YaciCommands from "./commands";
import YaciHosted from "./hosted";
import YaciSetup from "./setup";
import YaciStart from "./start";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags
        title={metaYaciGettingStarted.title}
        description={metaYaciGettingStarted.desc}
      />
      <SidebarFullwidth sidebarItems={getPageLinks()}>
        <TitleIconDescriptionBody
          title={metaYaciGettingStarted.title}
          description={metaYaciGettingStarted.desc}
        >
          <></>
        </TitleIconDescriptionBody>

        <YaciHosted />
        <YaciSetup />
        <YaciStart />
        <YaciCommands />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
