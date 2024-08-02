import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaTxbuilderStaking } from "~/data/links-txbuilders";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Send values", to: "sendValues" },
    { label: "Build with Object", to: "buildWithObject" },
  ];

  return (
    <>
      <Metatags
        title={metaTxbuilderStaking.title}
        description={metaTxbuilderStaking.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaTxbuilderStaking.title}
          description={metaTxbuilderStaking.desc}
          heroicon={metaTxbuilderStaking.icon}
        >
          <></>
        </TitleIconDescriptionBody>
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
