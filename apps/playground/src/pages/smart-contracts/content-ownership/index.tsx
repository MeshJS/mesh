import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import Codeblock from "~/components/text/codeblock";
import { metaContentOwnership } from "~/data/links-smart-contracts";
import { InstallSmartContract } from "../common";
import OwnershipCreateContent from "./create-content";
import OwnershipCreateContentRegistry from "./create-content-registry";
import OwnershipCreateOwnershipRegistry from "./create-ownership-registry";
import OwnershipGetContent from "./get-content";
import OwnershipGetOracleData from "./get-oracle-data";
import OwnershipMintMintingPolicy from "./mint-minting-policy";
import OwnershipMintUserToken from "./mint-user-token";
import OwnershipSendRefScriptOnchain from "./send-ref-script-onchain";
import OwnershipSetupOracleUtxo from "./setup-oracle-utxo";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Mint Policy", to: "mintOneTimeMintingPolicy" },
    { label: "Setup Oracle Utxo", to: "setupOracleUtxo" },
    { label: "Send Ref Script Onchain", to: "sendRefScriptOnchain" },
    { label: "Create Content Registry", to: "createContentRegistry" },
    { label: "Create Ownership Registry", to: "createOwnershipRegistry" },
    { label: "Get Oracle Data", to: "getOracleData" },
    { label: "Mint User Token", to: "mintUserToken" },
    { label: "Create Content", to: "createContent" },
    { label: "Get Content", to: "getContent" },
  ];

  let example = ``;
  example += `import { MeshContentOwnershipContract } from "@meshsdk/contract";\n`;
  example += `import { MeshTxBuilder, BlockfrostProvider } from "@meshsdk/core";\n`;
  example += `\n`;
  example += `const provider = new BlockfrostProvider('<Your-API-Key>');\n`;
  example += `\n`;
  example += `const meshTxBuilder = new MeshTxBuilder({\n`;
  example += `  fetcher: provider,\n`;
  example += `  submitter: provider,\n`;
  example += `});\n`;
  example += `\n`;
  example += `const contract = new MeshContentOwnershipContract(\n`;
  example += `  {\n`;
  example += `    mesh: meshTxBuilder,\n`;
  example += `    fetcher: provider,\n`;
  example += `    wallet: wallet,\n`;
  example += `    networkId: 0,\n`;
  example += `  },\n`;
  example += `  {\n`;
  example += `    operationAddress: operationAddress, // the address of the app owner, where most of the actions should be signed by the spending key of this address\n`;
  example += `    paramUtxo: { outputIndex: 0, txHash: "0000000000000000000000000000000000000000000000000000000000000000" }, // you can get this from the output of mintOneTimeMintingPolicy() transaction\n`;
  example += `    refScriptUtxos?: { // you can get these from the output of sendRefScriptOnchain() transactions\n`;
  example += `      contentRegistry: { outputIndex: 0, txHash: "0000000000000000000000000000000000000000000000000000000000000000" },\n`;
  example += `      contentRefToken: { outputIndex: 0, txHash: "0000000000000000000000000000000000000000000000000000000000000000" },\n`;
  example += `      ownershipRegistry: { outputIndex: 0, txHash: "0000000000000000000000000000000000000000000000000000000000000000" },\n`;
  example += `      ownershipRefToken: { outputIndex: 0, txHash: "0000000000000000000000000000000000000000000000000000000000000000" },\n`;
  example += `    },\n`;
  example += `  },\n`;
  example += `);\n`;

  return (
    <>
      <Metatags
        title={metaContentOwnership.title}
        description={metaContentOwnership.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaContentOwnership.title}
          description={metaContentOwnership.desc}
          heroicon={metaContentOwnership.icon}
        >
          <>
            <p>
              This contract allows you to create a content registry and users
              can create content that is stored in the registry.
            </p>

            <p>
              It facilitates on-chain record of content (i.e. file on IPFS)
              ownership and transfer. While one cannot prefer others from
              obtaining a copy of the content, the app owner of the contract can
              serve the single source of truth of who owns the content. With the
              blockchain trace and record in place, it provides a trustless way
              to verify the ownership of the content and facilitates further
              application logics such as royalties, licensing, etc.
            </p>

            <InstallSmartContract />

            <h3>Initialize the contract</h3>
            <p>
              To initialize the contract, we need to initialize a{" "}
              <Link href="/providers">provider</Link>,{" "}
              <code>MeshTxBuilder</code> and{" "}
              <code>MeshContentOwnershipContract</code>.
            </p>
            <Codeblock data={example} />
            <p>
              Both on-chain and off-chain codes are open-source and available on{" "}
              <Link href="https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/content-ownership">
                Mesh Github Repository
              </Link>
              .
            </p>
          </>
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/contracts/classes/MeshContentOwnershipContract" />

        <OwnershipMintMintingPolicy />
        <OwnershipSetupOracleUtxo />
        <OwnershipSendRefScriptOnchain />
        <OwnershipCreateContentRegistry />
        <OwnershipCreateOwnershipRegistry />
        <OwnershipGetOracleData />
        <OwnershipMintUserToken />
        <OwnershipCreateContent />
        <OwnershipGetContent />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
