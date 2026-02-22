import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaMinting } from "~/data/links-transactions";
import { Intro } from "../common";
import MintingAssetMetadata from "./asset-metadata";
import BurningOneSignature from "./burning-one-signature";
import MintingMaskMetadata from "./mask-metadata";
import MintingCip68 from "./minting-cip68";
import MintingNativeScript from "./minting-native-script";
import MintingOneSignature from "./minting-one-signature";
import MintingPlutusScript from "./minting-plutus-script";
import MintingRoyaltyToken from "./minting-royalty-token";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Mint with One Signature", to: "mintingOneSignature" },
    { label: "Asset Metadata", to: "assetMetadata" },
    { label: "Burn asset", to: "burningOneSignature" },
    { label: "Mint with Native Script", to: "mintingNativeScript" },
    { label: "Mint with Plutus Script", to: "mintingPlutusScript" },
    { label: "Mint with CIP-68", to: "mintingCip68" },
    { label: "Mint Royalty Token", to: "mintingRoyaltyToken" },
    { label: "Mask metadata", to: "maskMetadata" },
  ];

  return (
    <>
      <Metatags title={metaMinting.title} description={metaMinting.desc} />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaMinting.title}
          description={metaMinting.desc}
          heroicon={metaMinting.icon}
        >
          <p>
            Minting and burning assets is a common operation in blockchain
            applications. In the Cardano ecosystem, minting and burning are
            achieved through Native Scripts and Plutus Scripts. The Mesh SDK
            provides a set of APIs to interact with the blockchain and build
            transactions that can mint or burn assets.
          </p>
          <Intro />
          <p>
            In this page, you will find the APIs to create transactions for
            minting and burning assets.
          </p>
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/transactions/classes/Transaction" />

        <MintingOneSignature />
        <MintingAssetMetadata />
        <BurningOneSignature />
        <MintingNativeScript />
        <MintingPlutusScript />
        <MintingCip68 />
        <MintingRoyaltyToken />
        <MintingMaskMetadata />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
