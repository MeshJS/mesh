import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function YaciStart() {
  return (
    <TwoColumnsScroll
      sidebarTo="start"
      title="Start a Yaci Devnet"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code = "";
  code += `import { YaciProvider } from "@meshsdk/core";\n`;
  code += `\n`;
  code += `const blockchainProvider = new YaciProvider('http://localhost:8080/api/v1/');\n`;
  code += `const params = await blockchainProvider.fetchProtocolParameters();\n`;
  code += `console.log(params);\n`;

  return (
    <>
      <p>
        Open a terminal and navigate to the Yaci DevKit root directory. Run the
        following command to start the DevKit containers and yaci-cli:
      </p>
      <Codeblock data={`$ ./bin/devkit.sh start`} />

      <h3>Start node</h3>

      <p>To create a new devnet, run the following command from yaci-cli:</p>
      <Codeblock data={`yaci-cli:>create-node -o --start`} />
      <p>
        To create a new devnet with Babbage era, run the following command from
        yaci-cli:
      </p>
      <Codeblock data={`yaci-cli:>create-node -o --era babbage --start`} />
      <p>
        To start a devnet with zero fees, run the following command from
        yaci-cli:
      </p>
      <Codeblock
        data={`yaci-cli:>create-node -o --genesis-profile zero_fee --start`}
      />
      <p>
        To start a devnet with 30 slots per epoch, run the following command
        from yaci-cli:
      </p>
      <Codeblock data={`yaci-cli:>create-node -o -e 30 --start`} />

      <p>
        After you have started your devnet, you can open Yaci Viewer from{" "}
        <Link href="http://localhost:5173">http://localhost:5173</Link>. Here
        you can view the blocks, transactions, and other details of the devnet.
      </p>

      <p>
        If you want to configure the devnet, go to{" "}
        <code>config/node.properties</code>. And if you want to change settings
        and change default topup addreses, go to <code>config/env</code>.
      </p>

      <p>
        You can use <code>YaciProvider</code> with the Yaci Store Api URL
        (http://localhost:8080/api/v1), to interact with the Yaci Devnet.
      </p>
      <Codeblock data={code} />
    </>
  );
}
