import { use, useEffect } from "react";

import { HydraProvider } from "@meshsdk/core";

import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraOnMessage({
  hydraProvider,
  provider,
}: {
  hydraProvider: HydraProvider;
  provider: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="onMessage"
      title="Listens for new messages from Hydra node"
      leftSection={Left()}
      rightSection={Right(hydraProvider, provider)}
    />
  );
}

function Left() {
  let code = ``;
  code += `hydraProvider.onMessage((message) => {\n`;
  code += `  console.log("HydraProvider received message", message);\n`;
  code += `  // do something with the message\n`;
  code += `});\n`;

  return (
    <>
      <p>
        Listens for new messages from Hydra node. The callback function will be
        called with the message as the only argument. Check{" "}
        <Link href="https://hydra.family/head-protocol/api-reference/#operation-subscribe-/">
          all events emitted
        </Link>
        by the Hydra node.
      </p>
      <Codeblock data={code} />
    </>
  );
}

function Right(hydraProvider: HydraProvider, provider: string) {
  useEffect(() => {
    hydraProvider.onMessage((message) => {
      console.log("HydraProvider received message", message);
      // do something with the message
    });
  }, []);

  return <></>;
}
