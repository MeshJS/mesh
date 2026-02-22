import { MeshBadge } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { useDarkmode } from "~/hooks/useDarkmode";

export default function ReactPoweredMesh() {
  return (
    <TwoColumnsScroll
      sidebarTo="meshBadge"
      title="Powered by Mesh Badge"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        If you love Mesh, here's a beautifully designed badge for you to embed
        in your application.
      </p>

      <Codeblock data={`<MeshBadge isDark={true} />`} />
    </>
  );
}

function Right() {
  const isDark = useDarkmode((state) => state.isDark);

  let example = ``;
  example += `import { CardanoWallet } from '@meshsdk/react';\n`;
  example += `\n`;
  example += `export default function Page() {\n`;
  example += `  return (\n`;
  example += `    <>\n`;
  example += `      <CardanoWallet isDark={false} />\n`;
  example += `    </>\n`;
  example += `  );\n`;
  example += `}\n`;

  return (
    <LiveCodeDemo
      title="Mesh Badge Component"
      subtitle="Show your support for Mesh"
      code={example}
      childrenAfterCodeFunctions={true}
    >
      <MeshBadge isDark={isDark} />
    </LiveCodeDemo>
  );
}
