import type { NextPage } from "next";

import MintMeshToken from "~/components/cardano/mint-mesh-token";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import { demoAddresses } from "~/data/cardano";
import { metaMarketplace } from "~/data/links-smart-contracts";
import { InstallSmartContract } from "../common";
import MarketplaceBuyAsset from "./buy-asset";
import MarketplaceCancelListing from "./cancel-listing";
import MarketplaceListAsset from "./list-asset";
import MarketplaceUpdateListing from "./update-listing";
import ButtonFloatDocumentation from "~/components/button/button-float-documentation";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "List Asset", to: "listAsset" },
    { label: "Buy Asset", to: "buyAsset" },
    { label: "Update Listing", to: "updateListing" },
    { label: "Cancel Listing", to: "cancelListing" },
  ];

  let example = ``;

  example += `import { MeshMarketplaceContract } from "@meshsdk/contract";\n`;
  example += `import { MeshTxBuilder } from "@meshsdk/core";\n`;
  example += `\n`;
  example += `const provider = new BlockfrostProvider('<Your-API-Key>');\n`;
  example += `\n`;
  example += `const meshTxBuilder = new MeshTxBuilder({\n`;
  example += `  fetcher: provider,\n`;
  example += `  submitter: provider,\n`;
  example += `});\n`;
  example += `\n`;
  example += `const contract = new MeshMarketplaceContract(\n`;
  example += `  {\n`;
  example += `    mesh: meshTxBuilder,\n`;
  example += `    fetcher: provider,\n`;
  example += `    wallet: wallet,\n`;
  example += `    networkId: 0,\n`;
  example += `  },\n`;
  example += `  '${demoAddresses.testnet}',\n`;
  example += `  200, // 2% fee\n`;
  example += `);\n`;

  return (
    <>
      <Metatags
        title={metaMarketplace.title}
        description={metaMarketplace.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaMarketplace.title}
          description={metaMarketplace.desc}
          heroicon={metaMarketplace.icon}
        >
          <>
            <p>
              The marketplace smart contract allows users to buy and sell NFTs.
              A seller list an NFT for sales by specifying a certain price, and
              anyone can buy it by paying the demanded price.
            </p>
            <p>
              There are 4 actions (or endpoints) available to interact with this
              smart contract:
            </p>
            <ul>
              <li>list asset</li>
              <li>buy asset</li>
              <li>updating listing</li>
              <li>cancel listing</li>
            </ul>

            <InstallSmartContract />

            <h3>Initialize the Marketplace</h3>
            <p>
              Utilizing the Marketplace contract requires a blockchain provider
              and a connected browser wallet. Here is an example how we can
              initialize the Marketplace.
            </p>
            <Codeblock data={example} />
            <p>
              To initialize the Marketplace, we import the{" "}
              <code>MeshMarketplaceContract</code>. The first JSON object is the{" "}
              <code>inputs</code> for the <code>MeshTxInitiatorInput</code>,
              this requires a <code>MeshTxBuilder</code>, a{" "}
              <code>Provider</code>, a <code>Wallet</code>, and define the
              network ID.
            </p>
            <p>
              Second and third parameters are the <code>ownerAddress</code> and{" "}
              <code>feePercentageBasisPoint</code>. The{" "}
              <code>ownerAddress</code> is the address of the marketplace owner
              which will receive the marketplace fee. The{" "}
              <code>feePercentageBasisPoint</code> is the percentage of the sale
              price that the marketplace <code>owner</code> will take. The fee
              numerator is in the order of hundreds, for example{" "}
              <code>200</code> implies a fee of <code>2%</code>.
            </p>
            <p>
              Both on-chain and off-chain codes are open-source and available on{" "}
              <Link href="https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/marketplace">
                Mesh Github Repository
              </Link>
              .
            </p>

            <MintMeshToken />
          </>
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/contracts/classes/MeshMarketplaceContract" />

        <MarketplaceListAsset />
        <MarketplaceBuyAsset />
        <MarketplaceUpdateListing />
        <MarketplaceCancelListing />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
