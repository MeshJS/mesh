import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { demoAssetMetadata } from "~/data/cardano";

export default function MintingAssetMetadata() {
  return (
    <TwoColumnsScroll
      sidebarTo="assetMetadata"
      title="Define Asset Metadata"
      leftSection={Left()}
    />
  );
}

function Left() {
  let codeSnippet1 = `const assetMetadata: AssetMetadata = ${JSON.stringify(
    demoAssetMetadata,
    null,
    2,
  )};`;

  let codeSnippet2 = `const assetMetadata: AssetMetadata = ${JSON.stringify(
    {
      ...demoAssetMetadata,
      description: [
        "This NFT was minted by Mesh",
        "Learn how you can do it at https://meshjs.dev/",
      ],
    },
    null,
    2,
  )};`;

  return (
    <>
      <p>
        There are many ways to define asset metadata, the best way to find all
        is looking at the source code{" "}
        <Link href="https://github.com/MeshJS/mesh/blob/main/packages/mesh-common/src/types/asset-metadata.ts">
          asset-metadata.ts
        </Link>{" "}
        file.
      </p>
      <p>The most common is to define it as a JSON object with description:</p>
      <Codeblock data={codeSnippet1} />
      <p>
        For string values that are longer than 64 length, you can break it into
        a list of strings:
      </p>
      <Codeblock data={codeSnippet2} />
    </>
  );
}
