import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaYaciTransactions } from "~/data/links-yaci";
import { getPageLinks } from "../common";
import YaciBasicTransaction from "./basic-transaction";
import YaciImportProvider from "./provider";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags
        title={metaYaciTransactions.title}
        description={metaYaciTransactions.desc}
      />
      <SidebarFullwidth sidebarItems={getPageLinks()}>
        <TitleIconDescriptionBody
          title={metaYaciTransactions.title}
          description={metaYaciTransactions.desc}
        >
          <></>
        </TitleIconDescriptionBody>

        <YaciImportProvider />
        <YaciBasicTransaction />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
