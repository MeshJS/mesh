import type { NextPage } from "next";

import { U5CProvider } from "@meshsdk/core";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import { metaU5c } from "~/data/links-providers";
import { useProviders } from "~/hooks/useProviders";
import ProviderEvaluators from "./evaluators";
import ProviderFetchers from "./fetchers";
import ProviderListeners from "./listeners";
import ProviderSubmitters from "./submitters";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    // { label: "Get data from URL", to: "get" },
    // { label: "Fetch Account Info", to: "fetchAccountInfo" },
    { label: "Fetch Address Assets", to: "fetchAddressAssets" },
    { label: "Fetch Address Utxos", to: "fetchAddressUtxos" },
    // { label: "Fetch Asset Addresses", to: "fetchAssetAddresses" },
    // { label: "Fetch Asset Metadata", to: "fetchAssetMetadata" },
    // { label: "Fetch Block Info", to: "fetchBlockInfo" },
    // { label: "Fetch Collection Assets", to: "fetchCollectionAssets" },
    // { label: "Fetch Handle Address", to: "fetchHandleAddress" },
    // { label: "Fetch Handle", to: "fetchHandle" },
    { label: "Fetch Protocol Parameters", to: "fetchProtocolParameters" },
    // { label: "Fetch Transaction Info", to: "fetchTxInfo" },
    // { label: "Evaluate Tx", to: "evaluateTx" },
    { label: "Submit Tx", to: "submitTx" },
    { label: "On Transaction Confirmed", to: "onTxConfirmed" },
  ];

  let code1 = `import { U5CProvider } from "@meshsdk/core";\n\n`;
  code1 += `const provider = new U5CProvider({\n`;
  code1 += `  url: "http://localhost:50051",\n`;
  code1 += `  headers: {\n`;
  code1 += `    "dmtr-api-key": "<api-key>",\n`;
  code1 += `  },\n`;
  code1 += `});\n`;

  const utxorpc = useProviders((state) => state.utxorpc);

  const provider = new U5CProvider({
    url: utxorpc.url,
    headers: {
      "dmtr-api-key": utxorpc.key,
    },
  });

  return (
    <>
      <Metatags title={metaU5c.title} description={metaU5c.desc} />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaU5c.title}
          description={metaU5c.desc}
        >
          <p>
            The UTxORPC (u5c) provider facilitates access to this state in a
            standardized and efficient manner through gRPC, using a compact and
            high-performance binary format. It enables seamless interaction with
            the Cardano blockchain, to facilitate the creation, signing, and
            submission of transactions.
          </p>

          <ul>
            <li>
              <b>Standardized Interface</b>: Implements the UTxORPC
              specification to ensure compatibility and interoperability across
              UTxO-based blockchains.
            </li>
            <li>
              <b>Performance Optimized</b>: Utilizes gRPC for efficient
              communication with blockchain nodes, minimizing network overhead
              and message size.
            </li>
            <li>
              <b>Flexible Provider Options</b>: Suitable for use with hosted
              services, local nodes like Dolos, or any UTxORPC-compliant
              service.
            </li>
          </ul>

          <p>
            The following code samples assume that the UTxORPC node is running
            locally on localhost:50051. If your node is hosted remotely or on a
            different server, replace "http://localhost:50051" with the
            appropriate server URL and port for your environment.
          </p>

          <p>
            You can also use the UTxORPC provider with a hosted service like{" "}
            <Link href="https://demeter.run/">Demeter.run</Link>. Demeter is a
            PaaS (Platform-as-a-Service) that provides managed Cardano
            infrastructure. One of their services consists of a cloud-hosted
            endpoint for Cardano integration using the UTxO RPC spec. Developers
            can sign-up and get access to the API on a per-request basis.
          </p>

          <p>
            For more details on configuring your node, refer to the{" "}
            <Link href="https://github.com/utxorpc/docs/blob/main/pages/servers.md">
              UTxORPC Ecosystem Servers Documentation
            </Link>
            .
          </p>

          <Codeblock data={code1} />
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/providers/classes/U5CProvider" />

        <ProviderFetchers
          provider={provider}
          providerName="utxorpc"
        />
        <ProviderEvaluators
          provider={provider}
          providerName="utxorpc"
        />
        <ProviderSubmitters
          provider={provider}
          providerName="utxorpc"
        />
        <ProviderListeners
          provider={provider}
          providerName="utxorpc"
        />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
