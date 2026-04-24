import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function AikenEditorintegrations() {
  return (
    <TwoColumnsScroll
      sidebarTo="editors"
      title="Editor integrations"
      leftSection={Left()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Aiken language support for Visual Studio Code is provided by the Aiken
        extension. This extension provides syntax highlighting, code snippets,
        and error checking for Aiken smart contracts. Download the extension
        from the{" "}
        <Link href="https://marketplace.visualstudio.com/items?itemName=TxPipe.aiken">
          Visual Studio Code Marketplace
        </Link>{" "}
        or search <code>aiken</code> in the extensions tab of Visual Studio
        Code.
      </p>
    </>
  );
}
