import type { NextPage } from "next";

import { EmbeddedWallet } from "@meshsdk/midnight";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaMidnightTutorial } from "~/data/links-midnight";
import { getPageLinks } from "../common";
import MidnightTutorialPrerequisites from "./prerequisites";

const ReactPage: NextPage = () => {
  const wallet = new EmbeddedWallet({
    networkId: 1,
  });

  return (
    <>
      <Metatags
        title={metaMidnightTutorial.title}
        description={metaMidnightTutorial.desc}
      />
      <SidebarFullwidth sidebarItems={getPageLinks()}>
        <TitleIconDescriptionBody
          title={metaMidnightTutorial.title}
          description={metaMidnightTutorial.desc}
        >
          <>
            <p>This tutorial demonstrates,...</p>
          </>
        </TitleIconDescriptionBody>

        <MidnightTutorialPrerequisites wallet={wallet} />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
