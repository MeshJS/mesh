import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaSerializers } from "~/data/links-utilities";

const ReactPage: NextPage = () => {
  const sidebarItems = [{ label: "Coming soon", to: "resolveDataHash" }];

  return (
    <>
      <Metatags
        title={metaSerializers.title}
        description={metaSerializers.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaSerializers.title}
          description={metaSerializers.desc}
          heroicon={metaSerializers.icon}
        >
          <></>
        </TitleIconDescriptionBody>
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
