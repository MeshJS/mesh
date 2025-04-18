import type { NextPage } from "next";

import ButtonFloatDocumentation from "~/components/button/button-float-documentation";
import SidebarFullwidth from "~/components/layouts/sidebar-fullwidth";
import TitleIconDescriptionBody from "~/components/sections/title-icon-description-body";
import Metatags from "~/components/site/metatags";
import { metaTxbuilderMinting } from "~/data/links-txbuilders";
import { Intro } from "../common";
import TxbuilderBurningOneSignature from "./burning-one-signature";
import TxbuilderMintingCip68 from "./minting-cip68";
import TxbuilderMintingNativeScript from "./minting-native-script";
import TxbuilderMintAsset from "./minting-one-signature";
import TxbuilderMintingPlutusScript from "./minting-plutus-script";
import TxbuilderMintingRoyaltyToken from "./minting-royalty-token";
import TxbuilderMintMultipleAssets from "./multiple-assets";

const ReactPage: NextPage = () => {
  const sidebarItems = [
    { label: "Mint with One Signature", to: "mintingOneSignature" },
    { label: "Mint Multiple Assets", to: "mintingMultipleAssets" },
    { label: "Burn asset", to: "burningOneSignature" },
    { label: "Mint with Native Script", to: "mintingNativeScript" },
    { label: "Mint with Plutus Script", to: "mintingPlutusScript" },
    { label: "Mint with CIP-68", to: "mintingCip68" },
    { label: "Mint Royalty Token", to: "mintingRoyaltyToken" },
  ];

  return (
    <>
      <Metatags
        title={metaTxbuilderMinting.title}
        description={metaTxbuilderMinting.desc}
      />
      <SidebarFullwidth sidebarItems={sidebarItems}>
        <TitleIconDescriptionBody
          title={metaTxbuilderMinting.title}
          description={metaTxbuilderMinting.desc}
          heroicon={metaTxbuilderMinting.icon}
        >
          <>
            <p>
              Minting and burning assets is a common operation in blockchain
              applications. In the Cardano ecosystem, minting and burning are
              achieved through Native Scripts and Plutus Scripts.
            </p>
            <p>
              To view a video demonstration of this feature of the MeshSDK,
              navigate to the video guide{" "}
              <a href="/guides/nft-collection" target="_blank">
                Mint an NFT Collection
              </a>
              .
            </p>
            <Intro />
            <p>
              In this page, you will find the APIs to create transactions for
              minting and burning assets.
            </p>
          </>
        </TitleIconDescriptionBody>
        <ButtonFloatDocumentation href="https://docs.meshjs.dev/transactions/classes/MeshTxBuilder" />

        <TxbuilderMintAsset />
        <TxbuilderMintMultipleAssets />
        <TxbuilderBurningOneSignature />
        <TxbuilderMintingNativeScript />
        <TxbuilderMintingPlutusScript />
        <TxbuilderMintingCip68 />
        <TxbuilderMintingRoyaltyToken />
      </SidebarFullwidth>
    </>
  );
};

export default ReactPage;
