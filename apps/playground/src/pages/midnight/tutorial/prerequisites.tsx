import { EmbeddedWallet } from "@meshsdk/midnight";

import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function MidnightTutorialPrerequisites({
  wallet,
}: {
  wallet: EmbeddedWallet;
}) {
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
      <p>this is end to end hello world tutorial.</p>
    </>
  );
}
