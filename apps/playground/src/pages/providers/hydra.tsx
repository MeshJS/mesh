import type { NextPage } from "next";

import { HydraProvider } from "@meshsdk/hydra";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import { metaHydraProvider } from "~/data/links-providers";
import { useProviders } from "~/hooks/useProviders";
import ProviderHydra from "./hydra-endpoints";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Connects to Hydra Head", to: "connect" },
    { label: "Initializes Hydra Head", to: "initHead" },
    { label: "Abort Hydra Head", to: "abort" },
    { label: "New Transaction", to: "newTx" },
    { label: "Decommit UTxO", to: "decommit" },
    { label: "Close Hydra Head", to: "close" },
    { label: "Contest latest snapshot", to: "contest" },
    { label: "Fanout", to: "fanout" },
    { label: "On Message", to: "onMessage" },

    { label: "Fetch Address Utxos", to: "fetchAddressUtxos" },
    { label: "Fetch Protocol Parameters", to: "fetchProtocolParameters" },
    { label: "Fetch UTxOs", to: "fetchUtxos" },
    { label: "Submit Transaction", to: "submitTx" },
  ];

  let code1 = `import { HydraProvider } from "@meshsdk/hydra";\n\n`;
  code1 += `const provider = new HydraProvider('<URL>');`;
  code1 += `\nawait provider.connect();`;

  const hydraUrl = useProviders((state) => state.hydraUrl);

  const hydraProvider = new HydraProvider({
    url: `http://localhost:3000/api/hydra/${hydraUrl}`,
    wsUrl: `ws://${hydraUrl}`,
  });

  return (
    <>
      <Metatags
        title={metaHydraProvider.title}
        description={metaHydraProvider.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaHydraProvider.title}
          description={metaHydraProvider.desc}
        >
          <p>
            The{" "}
            <Link href="https://hydra.family/head-protocol/">
              Hydra Head protocol
            </Link>{" "}
            is a layer 2 scaling solution for Cardano rooted in peer-reviewed
            research that increases transaction throughput and ensures cost
            efficiency while maintaining rigorous security.
          </p>
          <p>Get started:</p>
          <Codeblock data={code1} />
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/providers/classes/HydraProvider" />

        <ProviderHydra provider={hydraProvider} providerName="hydra" />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
