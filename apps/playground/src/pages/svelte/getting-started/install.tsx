import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function SvelteInstall() {
  return (
    <TwoColumnsScroll
      sidebarTo="svelteInstall"
      title="Install"
      leftSection={Left()}
    />
  );
}

function Left() {
  return (
    <>
      <p>To start, install:</p>
      <Codeblock data={`npm install @meshsdk/svelte`} />
    </>
  );
}
