import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaAikenTransactions } from "~/data/links-aiken";
import { getPageLinks } from "../common";
import AikenLock from "./lock";
import AikenRedeem from "./redeem";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags
        title={metaAikenTransactions.title}
        description={metaAikenTransactions.desc}
      />
      <SidebarFullwidth sidebarItems={getPageLinks()}>
        <TitleIconDescriptionBody
          title={metaAikenTransactions.title}
          description={metaAikenTransactions.desc}
        >
          <></>
        </TitleIconDescriptionBody>

        <AikenLock />
        <AikenRedeem />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
