import type { NextPage } from "next";

import { KoiosProvider } from "@meshsdk/core";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import { metaKoios } from "~/data/links-providers";
import { useProviders } from "~/hooks/useProviders";
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
    { label: "Submit Tx", to: "submitTx" },
    { label: "On Transaction Confirmed", to: "onTxConfirmed" },
  ];

  let code1 = `import { KoiosProvider } from "@meshsdk/core";\n\n`;
  code1 += `const blockchainProvider = new KoiosProvider(\n`;
  code1 += `  'preprod', // "api" | "preview" | "preprod" | "guild"\n`;
  code1 += `  '<Your-API-Key>',\n`;
  code1 += `);\n`;

  const koiosKey = useProviders((state) => state.koiosKey);

  const blockchainProvider = new KoiosProvider(
    koiosKey?.network || "preprod",
    koiosKey?.apiKey || "",
  );

  return (
    <>
      <Metatags title={metaKoios.title} description={metaKoios.desc} />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaKoios.title}
          description={metaKoios.desc}
        >
          <p>
            <Link href="https://www.koios.rest/">Koios</Link> provides a query
            layer which allows your app to access information stored on the
            blockchain.
          </p>
          <iframe
            className="mx-auto h-64 w-full max-w-xl rounded-lg sm:h-96"
            src="https://www.youtube.com/embed/lOoPNYiVxkg"
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
          <p>Get started:</p>

          <Codeblock data={code1} />
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/providers/classes/KoiosProvider" />

        <ProviderFetchers
          blockchainProvider={blockchainProvider}
          provider="koios"
        />
        <ProviderSubmitters
          blockchainProvider={blockchainProvider}
          provider="koios"
        />
        <ProviderListeners
          blockchainProvider={blockchainProvider}
          provider="koios"
        />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
