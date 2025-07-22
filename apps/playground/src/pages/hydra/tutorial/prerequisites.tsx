import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function HydraTutorialPrerequisites() {
  return (
    <TwoColumnsScroll
      sidebarTo="prerequisites"
      title="Prerequisites"
      leftSection={Left()}
    />
  );
}

function Left() {
  return (
    <>
      <ul>
        <li>
          A running cardano node is required to access{" "}
          <code>cardano-cli</code>{" "}
        </li>
        <li>
          A <code>Hydra-node</code>
        </li>
        <li>Another participant following this tutorial (recommended), or</li>
        <li>Access to two such machines, or</li>
        <li>
          100 test ada per participant in a wallet on the <code>preprod</code>{" "}
          network
        </li>
      </ul>
      <ul>
        Hydra-node and cardano-node running, check{" "}
        <Link href="https://hydra.family/head-protocol/docs/tutorial#step-0-installation">
          Installation
        </Link>
        .
      </ul>
      You could also access a pre-built Docker image for a devnet{" "}
      <code>cardano-node</code> and <code>Hydra-node</code>
      for quickly following this tutorial. Check the setup{" "}
      <Link href="https://hydra.family/head-protocol/docs/getting-started">
        here
      </Link>
    </>
  );
}
