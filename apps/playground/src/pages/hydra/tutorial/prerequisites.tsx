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
      <p>
        First, generate Cardano key pairs and addresses for both participants to
        identify the hydra-node and manage funds on layer 1:
      </p>
      <ul>
        <li>
          Hydra node and cardano-node running, check{" "}
          <Link href="https://hydra.family/head-protocol/docs/installation/">
            Installation
          </Link>
          .
        </li>
      </ul>
    </>
  );
}
