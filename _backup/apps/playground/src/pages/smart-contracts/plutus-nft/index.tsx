import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import Link from "~/components/link";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaMintPlutusNft } from "~/data/links-smart-contracts";
import { InstallSmartContract } from "../common";
import PlutusNftGetOracleData from "./get-oracle-data";
import PlutusNftMint from "./mint-plutus-nft";
import PlutusNftSetupOracle from "./setup-oracle";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Setup Oracle", to: "setupOracle" },
    { label: "Mint Token", to: "plutusNftMint" },
    { label: "Get Oracle Data", to: "getOracleData" },
  ];

  return (
    <>
      <Metatags
        title={metaMintPlutusNft.title}
        description={metaMintPlutusNft.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaMintPlutusNft.title}
          description={metaMintPlutusNft.desc}
          heroicon={metaMintPlutusNft.icon}
        >
          <>
            <p>
              This NFT minting script enables users to mint NFTs with an
              automatically incremented index, which increases by one for each
              newly minted NFT.
            </p>
            <p>
              To facilitate this process, the first step is to set up a one-time
              minting policy by minting an oracle token. This oracle token is
              essential as it holds the current state and index of the NFTs,
              acting as a reference for the minting sequence.
            </p>
            <p>
              With each new NFT minted, the token index within the oracle is
              incremented by one, ensuring a consistent and orderly progression
              in the numbering of the NFTs.
            </p>
            <p>
              There are 3 actions available to interact with this smart
              contract:
            </p>
            <ul>
              <li>
                <strong>Setup Oracle:</strong> Mint one-time minting policy to
                set up the oracle
              </li>
              <li>
                <strong>Mint Token:</strong> Mint NFT that ensures the token
                name is incremented by a counter
              </li>
              <li>
                <strong>Get Oracle Data:</strong> Fetch the current oracle data
                to get the current NFT index and other information
              </li>
            </ul>

            <InstallSmartContract />

            <p>
              Both on-chain and off-chain codes are open-source and available on{" "}
              <Link href="https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/plutus-nft">
                Mesh Github Repository
              </Link>
              .
            </p>
          </>
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/contracts/classes/MeshPlutusNFTContract" />

        <PlutusNftSetupOracle />
        <PlutusNftMint />
        <PlutusNftGetOracleData />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
