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
        To create a new devnet with Conway era, run the following command from
        yaci-cli:
      </p>
      <Codeblock data={`yaci-cli:>create-node -o --era conway --start`} />
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
    </>
  );
}
