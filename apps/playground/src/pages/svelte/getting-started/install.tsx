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
  let addStyle = ``;
  addStyle += `<script lang="ts">\n`;
  addStyle += `	import '@meshsdk/svelte/styles.css';\n`;
  addStyle += `	let { children } = $props();\n`;
  addStyle += `</script>\n`;
  addStyle += `\n`;
  addStyle += `{@render children()}\n`;

  return (
    <>
      <p>To start, install:</p>
      <Codeblock data={`npm install @meshsdk/svelte`} />

      <p>
        Next, add the Mesh CSS to your application, doing so will apply the
        default styles to the components. You can add this in{" "}
        <code>+layout.svelte</code>.
      </p>
      <Codeblock data={addStyle} />
    </>
  );
}
