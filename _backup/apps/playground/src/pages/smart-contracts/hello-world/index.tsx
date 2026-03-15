import type { NextPage } from "next";

import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import { metaHelloWorld } from "~/data/links-smart-contracts";
import { InstallSmartContract } from "../common";
import HelloWorldLock from "./lock-asset";
import HelloWorldUnlock from "./unlock-asset";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Lock assets", to: "lockAsset" },
    { label: "Unlock assets", to: "unlockAsset" },
  ];

  let example = ``;

  example += `import { MeshHelloWorldContract } from "@meshsdk/contract";\n`;
  example += `import { MeshTxBuilder } from "@meshsdk/core";\n`;
  example += `\n`;
  example += `const provider = new BlockfrostProvider('<Your-API-Key>');\n`;
  example += `\n`;
  example += `const meshTxBuilder = new MeshTxBuilder({\n`;
  example += `  fetcher: provider,\n`;
  example += `  submitter: provider,\n`;
  example += `});\n`;
  example += `\n`;
  example += `const contract = new MeshHelloWorldContract({\n`;
  example += `  mesh: meshTxBuilder,\n`;
  example += `  fetcher: provider,\n`;
  example += `  wallet: wallet,\n`;
  example += `  networkId: 0,\n`;
  example += `});\n`;

  return (
    <>
      <Metatags
        title={metaHelloWorld.title}
        description={metaHelloWorld.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaHelloWorld.title}
          description={metaHelloWorld.desc}
          heroicon={metaHelloWorld.icon}
        >
          <>
            <p>
              The Hello World smart contract is a simple lock-and-unlock assets
              contract, providing a hands-on introduction to end-to-end smart
              contract validation and transaction building.
            </p>

            <p>There are 2 conditions to unlock the assets:</p>
            <ul>
              <li>Signer must be the same as the one who locked the assets</li>
              <li>
                Signer must provide the message <code>Hello, World!</code>
              </li>
            </ul>

            <p>
              There are 2 actions (or endpoints) available to interact with this
              smart contract:
            </p>
            <ul>
              <li>Lock assets</li>
              <li>Redeem assets</li>
            </ul>

            <InstallSmartContract />

            <h3>Initialize the contract</h3>
            <p>
              To initialize the contract, we need to initialize a{" "}
              <Link href="/providers">provider</Link>,{" "}
              <code>MeshTxBuilder</code> and <code>MeshGiftCardContract</code>.
            </p>
            <Codeblock data={example} />
            <p>
              Both on-chain and off-chain codes are open-source and available on{" "}
              <Link href="https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/hello-world">
                Mesh Github Repository
              </Link>
              .
            </p>
          </>
        </TitleIconDescriptionBody>

        <HelloWorldLock />
        <HelloWorldUnlock />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
