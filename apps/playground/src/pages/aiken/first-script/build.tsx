import Link from "~/components/link";

import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function AikenBuildScript() {
  return (
    <TwoColumnsScroll
      sidebarTo="build"
      title="Compile and build"
      leftSection={Left()}
    />
  );
}

function Left() {
  return (
    <>
      <p>Let's compile the smart contract with the Aiken CLI:</p>
      <Codeblock data={`$ aiken build`} />
      <p>
        This command will compile the smart contract and generate the
        <code>plutus.json</code> file in the root folder. This file is a{" "}
        <Link
          href="https://cips.cardano.org/cip/CIP-0057"
        >
          CIP-0057 Plutus blueprint
        </Link>
        , blueprint describes your on-chain contract and its binary interface.
      </p>
    </>
  );
}
