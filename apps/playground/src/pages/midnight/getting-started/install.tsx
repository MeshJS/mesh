import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function MidnightInstallationInstructions() {
  return (
    <TwoColumnsScroll
      sidebarTo="install"
      title="Installation Instructions"
      leftSection={Left()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        How to get started?
      </p>
      <Codeblock data={`$ do some cli`} />
      <h3>Check your installation</h3>
      <p>
        More instructions here.
      </p>
    </>
  );
}
