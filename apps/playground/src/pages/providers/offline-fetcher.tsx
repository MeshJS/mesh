import type { NextPage } from "next";
import { OfflineFetcher } from "@meshsdk/core";
import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import ProviderFetchers from "./fetchers";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Fetch Account Info", to: "fetchAccountInfo" },
    { label: "Fetch Address UTxOs", to: "fetchAddressUtxos" },
    { label: "Fetch Asset Addresses", to: "fetchAssetAddresses" },
    { label: "Fetch Asset Metadata", to: "fetchAssetMetadata" },
    { label: "Fetch Block Info", to: "fetchBlockInfo" },
    { label: "Fetch Collection Assets", to: "fetchCollectionAssets" },
    { label: "Fetch Handle Address", to: "fetchHandleAddress" },
    { label: "Fetch Handle", to: "fetchHandle" },
    { label: "Fetch Protocol Parameters", to: "fetchProtocolParameters" },
    { label: "Fetch Transaction Info", to: "fetchTxInfo" },
    { label: "Fetch UTxOs", to: "fetchUtxos" },
  ];

  let code1 = `import { OfflineFetcher } from "@meshsdk/core";\n\n`;
  code1 += `// Create a new instance\n`;
  code1 += `const fetcher = new OfflineFetcher();\n`;
  code1 += `// Create with specified network\n`;
  code1 += `const fetcherWithNetwork = new OfflineFetcher("mainnet");\n`;

  let code2 = `// Add account information\n`;
  code2 += `fetcher.addAccount("addr1...", {\n`;
  code2 += `  balance: "1000000",\n`;
  code2 += `  rewards: "500000",\n`;
  code2 += `  withdrawals: "100000",\n`;
  code2 += `  poolId: "pool1..." // optional\n`;
  code2 += `});\n\n`;
  code2 += `// Add UTXOs\n`;
  code2 += `fetcher.addUTxOs([\n`;
  code2 += `  {\n`;
  code2 += `    input: { \n`;
  code2 += `      txHash: "1234...", \n`;
  code2 += `      outputIndex: 0 \n`;
  code2 += `    },\n`;
  code2 += `    output: {\n`;
  code2 += `      address: "addr1...",\n`;
  code2 += `      amount: [{ unit: "lovelace", quantity: "1000000" }],\n`;
  code2 += `      // Optional fields for script UTXOs:\n`;
  code2 += `      scriptHash: "abcd...",\n`;
  code2 += `      dataHash: "ef12...",\n`;
  code2 += `      plutusData: "...",\n`;
  code2 += `      scriptRef: "..."\n`;
  code2 += `    }\n`;
  code2 += `  }\n`;
  code2 += `]);\n\n`;
  code2 += `// Add asset addresses\n`;
  code2 += `fetcher.addAssetAddresses("policyID.assetName", [\n`;
  code2 += `  { address: "addr1...", quantity: "1" }\n`;
  code2 += `]);\n\n`;
  code2 += `// Add asset metadata\n`;
  code2 += `fetcher.addAssetMetadata("policyID.assetName", {\n`;
  code2 += `  name: "Asset Name",\n`;
  code2 += `  image: "ipfs://...",\n`;
  code2 += `  // Any other metadata attributes\n`;
  code2 += `});\n\n`;
  code2 += `// Add protocol parameters\n`;
  code2 += `fetcher.addProtocolParameters({\n`;
  code2 += `  epoch: 290,\n`;
  code2 += `  minFeeA: 44,\n`;
  code2 += `  minFeeB: 155381,\n`;
  code2 += `  maxBlockSize: 73728,\n`;
  code2 += `  maxTxSize: 16384,\n`;
  code2 += `  maxBlockHeaderSize: 1100,\n`;
  code2 += `  keyDeposit: 2000000,\n`;
  code2 += `  poolDeposit: 500000000,\n`;
  code2 += `  minPoolCost: "340000000",\n`;
  code2 += `  // Other parameters...\n`;
  code2 += `});\n\n`;
  code2 += `// Add serilized transaction\n`;
  code2 += `fetcher.addSerializedTransaction("txHash");\n\n`;

  let code3 = `// Save state\n`;
  code3 += `const state = fetcher.toJSON();\n`;
  code3 += `localStorage.setItem('fetcher-state', state);\n\n`;
  code3 += `// Load state\n`;
  code3 += `const savedState = localStorage.getItem('fetcher-state');\n`;
  code3 += `const fetcher = OfflineFetcher.fromJSON(savedState);\n`;

  const fetcher = new OfflineFetcher();

  return (
    <>
      <Metatags
        title="Offline Fetcher"
        description="An offline blockchain data provider for testing, development and offline scenarios."
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title="OfflineFetcher"
          description="An offline blockchain data provider for testing, development and offline scenarios."
        >
          <p>
            The OfflineFetcher provides access to blockchain data without requiring network
            connectivity. It's ideal for testing, development, and scenarios where you need
            to work with pre-loaded blockchain data offline.
          </p>

          <p>Initialize the fetcher:</p>

          <Codeblock data={code1} />

          <p>
            Before you can fetch data, you need to add it to the fetcher. Here are examples
            of adding different types of blockchain data:
          </p>

          <Codeblock data={code2} />

          <p>
            The fetcher's state can be saved and loaded, making it easy to persist data
            between sessions:
          </p>

          <Codeblock data={code3} />

          <p>
            Once data is added, you can use the fetch* methods just like with other providers
            such as {" "}
            <Link href="/providers/blockfrost">
              BlockfrostProvider
            </Link>
            . This makes OfflineFetcher a drop-in replacement for testing and offline scenarios.
          </p>
        </TitleIconDescriptionBody>

        <ButtonFloatDocumentation href="https://docs.meshjs.dev/providers/classes/OfflineFetcher" />

        <ProviderFetchers
          provider={fetcher}
          providerName="offline"
        />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
