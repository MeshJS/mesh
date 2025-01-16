import type { NextPage } from "next";
import { useState } from "react";

import { MeshWallet } from "@meshsdk/core";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaHydraTutorial } from "~/data/links-hydra";
import { getPageLinks } from "../common";
import HydraTutorialPrerequisites from "./prerequisites";
import HydraTutorialStep2 from "./step2";

const ReactPage: NextPage = () => {
  const [aliceNode, setAliceNode] = useState<MeshWallet | undefined>(undefined);
  const [aliceFunds, setAliceFunds] = useState<MeshWallet | undefined>(
    undefined,
  );
  const [bobNode, setBobNode] = useState<MeshWallet | undefined>(undefined);
  const [bobFunds, setBobFunds] = useState<MeshWallet | undefined>(undefined);

  return (
    <>
      <Metatags
        title={metaHydraTutorial.title}
        description={metaHydraTutorial.desc}
      />
      <SidebarFullwidth sidebarItems={getPageLinks()}>
        <TitleIconDescriptionBody
          title={metaHydraTutorial.title}
          description={metaHydraTutorial.desc}
        >
          <>
            <p>
              This tutorial demonstrates how to use hydra-node on Cardano's
              preprod testing environment to open a layer 2 state channel
              between two participants using the Hydra Head protocol.
            </p>
            <p>
              This tutorial is adapted from{" "}
              <Link href="https://hydra.family/head-protocol/docs/tutorial/">
                the Hydra documentation
              </Link>
              .
            </p>
          </>
        </TitleIconDescriptionBody>

        <HydraTutorialPrerequisites />
        <HydraTutorialStep2
          aliceNode={aliceNode}
          aliceFunds={aliceFunds}
          bobNode={bobNode}
          bobFunds={bobFunds}
          setAliceNode={setAliceNode}
          setAliceFunds={setAliceFunds}
          setBobNode={setBobNode}
          setBobFunds={setBobFunds}
        />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
