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
        <li>Access to two such machines</li>
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
      You could also set-up a Docker container for a <code>cardano-node</code>{" "}
      and <code>Hydra-node</code>
      to quickly follow this tutorial. Check the setup example/demo for a devnet{" "}
      <Link href="https://github.com/cardano-scaling/hydra/tree/master/demo">
        here
      </Link>
    </>
  );
}
