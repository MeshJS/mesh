import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function YaciHosted() {
  return (
    <TwoColumnsScroll
      sidebarTo="hosted"
      title="Mesh Hosted Yaci Devnet"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code = "";
  code += `import { YaciProvider } from "@meshsdk/core";\n`;
  code += `\n`;
  code += `const provider = new YaciProvider();\n`;
  code += `const params = await provider.fetchProtocolParameters();\n`;
  code += `console.log(params);\n`;

  return (
    <>
      <h3>Connect right away with Yaci Provider</h3>
      <p>
        Mesh has a hosted Yaci Devnet that you can connect to right away. You
        can use the following URL to connect to the hosted Yaci Devnet:
      </p>
      <Codeblock data={`https://yaci-node.meshjs.dev/api/v1/`} />
      <h3>Import Yaci Provider</h3>
      <p>
        Import <code>YaciProvider</code> and start using it to interact with the
        Yaci Devnet.
      </p>
      <Codeblock data={code} />
      <p>
        <Link href="/yaci/transactions/provider">
          Learn more about Yaci Provider
        </Link>{" "}
        and learn more about{" "}
        <Link href="https://cloud.meshjs.dev/yaci">hosted Yaci Devnet</Link>
      </p>
    </>
  );
}
