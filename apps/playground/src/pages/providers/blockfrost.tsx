import type { NextPage } from "next";

import { BlockfrostProvider } from "@meshsdk/core";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import { metaBlockfrost } from "~/data/links-providers";
import { useProviders } from "~/hooks/useProviders";
import ProviderEvaluators from "./evaluators";
import ProviderFetchers from "./fetchers";
import ProviderListeners from "./listeners";
import ProviderSubmitters from "./submitters";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Get data from URL", to: "get" },
    { label: "Fetch Account Info", to: "fetchAccountInfo" },
    { label: "Fetch Address Assets", to: "fetchAddressAssets" },
    { label: "Fetch Address Utxos", to: "fetchAddressUtxos" },
    { label: "Fetch Asset Addresses", to: "fetchAssetAddresses" },
    { label: "Fetch Asset Metadata", to: "fetchAssetMetadata" },
    { label: "Fetch Block Info", to: "fetchBlockInfo" },
    { label: "Fetch Collection Assets", to: "fetchCollectionAssets" },
    { label: "Fetch Handle Address", to: "fetchHandleAddress" },
    { label: "Fetch Handle", to: "fetchHandle" },
    { label: "Fetch Protocol Parameters", to: "fetchProtocolParameters" },
    { label: "Fetch Transaction Info", to: "fetchTxInfo" },
    { label: "Fetch UTxOs", to: "fetchUtxos" },
    { label: "Fetch Proposal Info", to: "fetchProposalInfo" },
    { label: "Evaluate Tx", to: "evaluateTx" },
    { label: "Submit Transaction", to: "submitTx" },
    { label: "On Transaction Confirmed", to: "onTxConfirmed" },
  ];

  let code1 = `import { BlockfrostProvider } from "@meshsdk/core";\n\n`;
  code1 += `const provider = new BlockfrostProvider('<Your-API-Key>');\n`;

  let code2 = `const provider = new BlockfrostProvider('<BLOCKFROST_URL>');\n`;

  const blockfrostKey = useProviders((state) => state.blockfrostKey);

  const provider = new BlockfrostProvider(blockfrostKey ?? "");

  return (
    <>
      <Metatags
        title={metaBlockfrost.title}
        description={metaBlockfrost.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaBlockfrost.title}
          description={metaBlockfrost.desc}
        >
          <p>
            <Link href="https://blockfrost.io/">Blockfrost</Link> provides
            restful APIs which allows your app to access information stored on
            the blockchain.
          </p>

          <p>Get started:</p>

          <Codeblock data={code1} />

          <p>
            If you are using a privately hosted Blockfrost instance, you can set
            the URL in the parameter:
          </p>
          <Codeblock data={code2} />
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/providers/classes/BlockfrostProvider" />

        <ProviderFetchers
          provider={provider}
          providerName="blockfrost"
        />
        <ProviderEvaluators
          provider={provider}
          providerName="blockfrost"
        />
        <ProviderSubmitters
          provider={provider}
          providerName="blockfrost"
        />
        <ProviderListeners
          provider={provider}
          providerName="blockfrost"
        />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
