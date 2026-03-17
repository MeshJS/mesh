import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import { metaGiftcard } from "~/data/links-smart-contracts";
import { InstallSmartContract } from "../common";
import GiftcardCreate from "./create-giftcard";
import GiftcardRedeem from "./redeem-giftcard";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Create Giftcard", to: "createGiftCard" },
    { label: "Redeem Giftcard", to: "redeemGiftCard" },
  ];

  let example = ``;

  example += `import { MeshGiftCardContract } from "@meshsdk/contract";\n`;
  example += `import { MeshTxBuilder } from "@meshsdk/core";\n`;
  example += `\n`;
  example += `const provider = new BlockfrostProvider('<Your-API-Key>');\n`;
  example += `\n`;
  example += `const meshTxBuilder = new MeshTxBuilder({\n`;
  example += `  fetcher: provider,\n`;
  example += `  submitter: provider,\n`;
  example += `});\n`;
  example += `\n`;
  example += `const contract = new MeshGiftCardContract({\n`;
  example += `  mesh: meshTxBuilder,\n`;
  example += `  fetcher: provider,\n`;
  example += `  wallet: wallet,\n`;
  example += `  networkId: 0,\n`;
  example += `});\n`;

  return (
    <>
      <Metatags title={metaGiftcard.title} description={metaGiftcard.desc} />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaGiftcard.title}
          description={metaGiftcard.desc}
          heroicon={metaGiftcard.icon}
        >
          <>
            <p>
              Giftcard contract allows users to create a transactions to lock
              assets into the smart contract, which can be redeemed by any user.
            </p>
            <p>
              Creating a giftcard will mint a token and send the assets to the
              contract. While redeeming will burn the token and send the assets
              to the redeemer.
            </p>

            <p>
              There are 2 actions (or endpoints) available to interact with this
              smart contract:
            </p>
            <ul>
              <li>create giftcard</li>
              <li>redeem giftcard</li>
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
              <Link href="https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/giftcard">
                Mesh Github Repository
              </Link>
              .
            </p>
          </>
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/contracts/classes/MeshGiftCardContract" />

        <GiftcardCreate />
        <GiftcardRedeem />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
