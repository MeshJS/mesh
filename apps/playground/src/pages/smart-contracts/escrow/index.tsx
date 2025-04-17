import type { NextPage } from "next";

import MintMeshToken from "~/components/cardano/mint-mesh-token";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import { metaEscrow } from "~/data/links-smart-contracts";
import { InstallSmartContract } from "../common";
import EscrowCancelEscrow from "./cancel-escrow";
import EscrowCompleteEscrow from "./complete-escrow";
import EscrowInitiateEscrow from "./initiate-escrow";
import EscrowRecipientDeposit from "./recipient-deposit";
import ButtonFloatDocumentation from "~/components/button/button-float-documentation";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Escrow Initiate", to: "initiateEscrow" },
    { label: "Recipient Deposit", to: "recipientDeposit" },
    { label: "Complete Escrow", to: "completeEscrow" },
    { label: "Cancel Escrow", to: "cancelEscrow" },
  ];

  let example = ``;

  example += `import { MeshEscrowContract } from "@meshsdk/contract";\n`;
  example += `import { MeshTxBuilder } from "@meshsdk/core";\n`;
  example += `\n`;
  example += `const provider = new BlockfrostProvider('<Your-API-Key>');\n`;
  example += `\n`;
  example += `const meshTxBuilder = new MeshTxBuilder({\n`;
  example += `  fetcher: provider,\n`;
  example += `  submitter: provider,\n`;
  example += `});\n`;
  example += `\n`;
  example += `const contract = new MeshEscrowContract({\n`;
  example += `  mesh: meshTxBuilder,\n`;
  example += `  fetcher: provider,\n`;
  example += `  wallet: wallet,\n`;
  example += `  networkId: 0,\n`;
  example += `});\n`;

  return (
    <>
      <Metatags title={metaEscrow.title} description={metaEscrow.desc} />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaEscrow.title}
          description={metaEscrow.desc}
          heroicon={metaEscrow.icon}
        >
          <>
            <p>
              The escrow smart contract allows two parties to exchange assets
              securely. The contract holds the assets until both parties agree
              and sign off on the transaction.
            </p>
            <p>
              There are 4 actions available to interact with this smart
              contract:
            </p>
            <ul>
              <li>initiate escrow and deposit assets</li>
              <li>deposit assets</li>
              <li>complete escrow</li>
              <li>cancel escrow</li>
            </ul>

            <InstallSmartContract />

            <h3>Initialize the contract</h3>
            <p>
              To initialize the escrow, we need to initialize a{" "}
              <Link href="/providers">provider</Link>,{" "}
              <code>MeshTxBuilder</code> and <code>MeshEscrowContract</code>.
            </p>
            <Codeblock data={example} />
            <p>
              Both on-chain and off-chain codes are open-source and available on{" "}
              <Link href="https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/escrow">
                Mesh Github Repository
              </Link>
              .
            </p>

            <MintMeshToken />
          </>
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/contracts/classes/MeshEscrowContract" />

        <EscrowInitiateEscrow />
        <EscrowRecipientDeposit />
        <EscrowCompleteEscrow />
        <EscrowCancelEscrow />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
