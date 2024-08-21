import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaDeserializers } from "~/data/links-utilities";
import DeserializeAddress from "./deserialize-address";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Deserialize Address", to: "deserializeAddress" },
  ];

  return (
    <>
      <Metatags
        title={metaDeserializers.title}
        description={metaDeserializers.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaDeserializers.title}
          description={metaDeserializers.desc}
          heroicon={metaDeserializers.icon}
        >
          <></>
        </TitleIconDescriptionBody>

        <DeserializeAddress />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
