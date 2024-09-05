import type { NextPage } from "next";

import { YaciProvider } from "@meshsdk/core";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import { metaYaci } from "~/data/links-providers";
import { useProviders } from "~/hooks/useProviders";
import ProviderEvaluators from "./evaluators";
import ProviderFetchers from "./fetchers";
import ProviderListeners from "./listeners";
import ProviderSubmitters from "./submitters";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Fetch Account Info", to: "fetchAccountInfo" },
    { label: "Fetch Address Utxos", to: "fetchAddressUtxos" },
    { label: "Fetch Asset Addresses", to: "fetchAssetAddresses" },
    { label: "Fetch Asset Metadata", to: "fetchAssetMetadata" },
    { label: "Fetch Block Info", to: "fetchBlockInfo" },
    { label: "Fetch Collection Assets", to: "fetchCollectionAssets" },
    { label: "Fetch Handle Address", to: "fetchHandleAddress" },
    { label: "Fetch Handle", to: "fetchHandle" },
    { label: "Fetch Protocol Parameters", to: "fetchProtocolParameters" },
    { label: "Fetch Transaction Info", to: "fetchTxInfo" },
    { label: "Evaluate Tx", to: "evaluateTx" },
    { label: "Submit Tx", to: "submitTx" },
    { label: "On Transaction Confirmed", to: "onTxConfirmed" },
  ];

  let code1 = `import { YaciProvider } from "@meshsdk/core";\n\n`;
  code1 += `const blockchainProvider = new YaciProvider('<YACI_URL>');`;

  const yaciUrl = useProviders((state) => state.yaciUrl);

  const blockchainProvider = new YaciProvider(yaciUrl);

  return (
    <>
      <Metatags title={metaYaci.title} description={metaYaci.desc} />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaYaci.title}
          description={metaYaci.desc}
        >
          <p>
            <Link href="https://github.com/bloxbean/yaci-devkit">
              Yaci DevKit
            </Link>{" "}
            is a development tool designed for rapid and efficient Cardano
            blockchain development. It allows developers to create and destroy
            custom Cardano devnets in seconds, providing fast feedback loops and
            simplifying the iteration process.
          </p>

          <p>Get started:</p>
          <Codeblock data={code1} />
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/providers/classes/YaciProvider" />

        <ProviderFetchers
          blockchainProvider={blockchainProvider}
          provider="yaci"
        />
        <ProviderEvaluators
          blockchainProvider={blockchainProvider}
          provider="yaci"
        />
        <ProviderSubmitters
          blockchainProvider={blockchainProvider}
          provider="yaci"
        />
        <ProviderListeners
          blockchainProvider={blockchainProvider}
          provider="yaci"
        />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
