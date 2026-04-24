import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import MintMeshToken from "~/components/cardano/mint-mesh-token";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import { metaSwap } from "~/data/links-smart-contracts";
import { InstallSmartContract } from "../common";
import SwapAcceptSwap from "./accept-swap";
import SwapCancelSwap from "./cancel-swap";
import SwapInitiateSwap from "./initiate-swap";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Initiate Swap", to: "initiateSwap" },
    { label: "Accept Swap", to: "acceptSwap" },
    { label: "Cancel Swap", to: "cancelSwap" },
  ];

  let example = ``;

  example += `import { MeshSwapContract } from "@meshsdk/contract";\n`;
  example += `import { MeshTxBuilder } from "@meshsdk/core";\n`;
  example += `\n`;
  example += `const provider = new BlockfrostProvider('<Your-API-Key>');\n`;
  example += `\n`;
  example += `const meshTxBuilder = new MeshTxBuilder({\n`;
  example += `  fetcher: provider,\n`;
  example += `  submitter: provider,\n`;
  example += `});\n`;
  example += `\n`;
  example += `const contract = new MeshSwapContract({\n`;
  example += `  mesh: meshTxBuilder,\n`;
  example += `  fetcher: provider,\n`;
  example += `  wallet: wallet,\n`;
  example += `  networkId: 0,\n`;
  example += `});\n`;

  return (
    <>
      <Metatags title={metaSwap.title} description={metaSwap.desc} />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaSwap.title}
          description={metaSwap.desc}
          heroicon={metaSwap.icon}
        >
          <>
            <p>
              Swap contract facilitates the exchange of assets between two
              parties. This contract is designed to be used in a peer-to-peer
              exchange scenario where two parties agree to exchange assets. The
              contract ensures that the assets are locked up until it is
              accepted by the other party. At any point before it is accepted,
              one can cancel the swap to retrieve the assets.
            </p>
            <p>
              There are 2 actions (or endpoints) available to interact with this
              smart contract:
            </p>
            <ul>
              <li>initiate swap</li>
              <li>accept asset</li>
              <li>cancel swap</li>
            </ul>

            <InstallSmartContract />

            <h3>Initialize the contract</h3>
            <p>
              To initialize the swap, we need to initialize a{" "}
              <Link href="/providers">provider</Link>,{" "}
              <code>MeshTxBuilder</code> and <code>MeshSwapContract</code>.
            </p>
            <Codeblock data={example} />
            <p>
              Both on-chain and off-chain codes are open-source and available on{" "}
              <Link href="https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/swap">
                Mesh Github Repository
              </Link>
              .
            </p>

            <MintMeshToken />
          </>
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/contracts/classes/MeshSwapContract" />

        <SwapInitiateSwap />
        <SwapAcceptSwap />
        <SwapCancelSwap />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
