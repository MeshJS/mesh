import type { NextPage } from "next";
import { useState } from "react";

import { MeshWallet } from "@meshsdk/core";
import { HydraInstance, HydraProvider } from "@meshsdk/hydra";

import { getProvider } from "~/components/cardano/mesh-wallet";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import { metaHydraTutorial } from "~/data/links-hydra";
import { useProviders } from "~/hooks/useProviders";
import { getPageLinks } from "../common";
import HydraTutorialPrerequisites from "./prerequisites";
import HydraTutorialStep1 from "./step1";
import HydraTutorialStep2 from "./step2";
import HydraTutorialStep4 from "./step3";
import HydraTutorialStep5 from "./step4";
import HydraTutorialStep6 from "./step5";

const ReactPage: NextPage = () => {
  const [aliceNode, setAliceNode] = useState<MeshWallet | undefined>(undefined);
  const [aliceFunds, setAliceFunds] = useState<MeshWallet | undefined>(
    undefined,
  );
  const [bobNode, setBobNode] = useState<MeshWallet | undefined>(undefined);
  const [bobFunds, setBobFunds] = useState<MeshWallet | undefined>(undefined);

  const hydraUrl = useProviders((state) => state.hydraUrl);
  const hydraProvider = new HydraProvider({
    url: hydraUrl,
    //wsUrl: hydraUrl,
  });
  const providerName = "hydra";
  const blockfrostProvider = getProvider();

  const hydraInstance = new HydraInstance({
    provider: hydraProvider,
    fetcher: blockfrostProvider,
    submitter: blockfrostProvider,
  });

  let codeSnippet = ``;
  codeSnippet += `import { HydraInstance, HydraProvider } from "@meshsdk/hydra";\n`;
  codeSnippet += `\n`;
  codeSnippet += `const provider = new HydraProvider({\n`;
  codeSnippet += `  url: "<URL>",\n`;
  codeSnippet += `});\n`;
  codeSnippet += `\n`;
  codeSnippet += `const hydraInstance = new HydraInstance({\n`;
  codeSnippet += `  provider:  provider,\n`;
  codeSnippet += `  fetcher:   provider,\n`;
  codeSnippet += `  submitter: provider,\n`;
  codeSnippet += `});\n`;

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
              This tutorial demonstrates how to use Hydra Head protocol on
              Cardano's preprod testing environment to open a layer 2 state
              channel between two participants using Mesh SDK.
            </p>
            <p>
              Hydra Head is a layer 2 scaling solution for Cardano that enables
              fast, low-cost transactions between participants. This tutorial
              shows you how to set up and use Hydra with Mesh SDK.
            </p>
            <p>
              This tutorial is adapted from{" "}
              <Link href="https://hydra.family/head-protocol/docs/tutorial">
                the Hydra documentation
              </Link>
              .
            </p>

            <h3>Initialize Hydra with Mesh</h3>
            <p>
              To initialize Hydra with Mesh SDK, you need to set up a{" "}
              <Link href="/providers">provider</Link>,{" "}
              <code>HydraProvider</code> and <code>HydraInstance</code>.
            </p>
            <Codeblock data={codeSnippet} />
          </>
        </TitleIconDescriptionBody>

        <HydraTutorialPrerequisites />
        <HydraTutorialStep1
          aliceNode={aliceNode}
          aliceFunds={aliceFunds}
          bobNode={bobNode}
          bobFunds={bobFunds}
          setAliceNode={setAliceNode}
          setAliceFunds={setAliceFunds}
          setBobNode={setBobNode}
          setBobFunds={setBobFunds}
        />
        <HydraTutorialStep2 />
        <HydraTutorialStep4
          provider={hydraProvider}
          providerName={providerName}
          hInstance={hydraInstance}
        />
        <HydraTutorialStep5
          provider={hydraProvider}
          providerName={providerName}
        />
        <HydraTutorialStep6
          provider={hydraProvider}
          providerName={providerName}
        />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
