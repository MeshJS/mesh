import type { NextPage } from "next";

import { MaestroProvider } from "@meshsdk/core";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import { metaMaestro } from "~/data/links-providers";
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
    { label: "Submit Tx", to: "submitTx" },
    { label: "On Transaction Confirmed", to: "onTxConfirmed" },
  ];

  let code1 = `import { MaestroProvider } from "@meshsdk/core";\n\n`;
  code1 += `const provider = new MaestroProvider({\n`;
  code1 += `  network: 'Preprod', // Mainnet / Preprod / Preview\n`;
  code1 += `  apiKey: '<Your-API-Key>', // Get key at https://docs.gomaestro.org/\n`;
  code1 += `  turboSubmit: false // Read about paid turbo transaction submission feature at https://docs.gomaestro.org\n`;
  code1 += `});\n`;

  const maestroKey = useProviders((state) => state.maestroKey);

  const provider = new MaestroProvider({
    network: maestroKey?.network || "Preprod",
    apiKey: maestroKey?.apiKey || "",
    turboSubmit: false,
  });

  return (
    <>
      <Metatags title={metaMaestro.title} description={metaMaestro.desc} />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaMaestro.title}
          description={metaMaestro.desc}
        >
          <p>
            <Link href="https://www.gomaestro.org/">Maestro</Link> is the
            complete Web3 stack for Cardano which provides among others:-
          </p>
          <ul>
            <li>⛓️ Enterprise-grade onchain data access.</li>
            <li>
              ⚡️ Transaction monitoring system with submission retires,
              rollback notifications and accelerated tranaction finality.
            </li>
            <li>
              💰 High-fidelity smart contract data feeds from top Cardano DeFi
              protocols.
            </li>
            <li>
              📝 Fully managed smart contract APIs and ready-to-go UI plugins.
            </li>
          </ul>
          <p>Get started:</p>
          <Codeblock data={code1} />
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/providers/classes/MaestroProvider" />

        <ProviderFetchers
          provider={provider}
          providerName="maestro"
        />
        <ProviderEvaluators
          provider={provider}
          providerName="maestro"
        />
        <ProviderSubmitters
          provider={provider}
          providerName="maestro"
        />
        <ProviderListeners
          provider={provider}
          providerName="maestro"
        />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
