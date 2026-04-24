import { useEffect } from "react";

import { HydraProvider } from "@meshsdk/hydra";

import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function HydraOnMessage({
  provider,
  providerName,
}: {
  provider: HydraProvider;
  providerName: string;
}) {
  return (
    <TwoColumnsScroll
      sidebarTo="onMessage"
      title="Listens for new messages from Hydra node"
      leftSection={Left()}
      rightSection={Right(provider, providerName)}
    />
  );
}

function Left() {
  let code = ``;
  code += `provider.onMessage((message) => {\n`;
  code += `  console.log("HydraProvider received message", message);\n`;
  code += `  // do something with the message\n`;
  code += `});\n`;

  let code2 = ``;
  code2 += `provider.onMessage((message) => {\n`;
  code2 += `  if (message.tag === "Greetings") {\n`;
  code2 += `    console.log("message.snapshotUtxo", message.snapshotUtxo);\n`;
  code2 += `  }\n`;
  code2 += `});\n`;

  return (
    <>
      <p>
        Listens for new messages from Hydra node. The callback function will be
        called with the message as the only argument. Check{" "}
        <Link href="https://hydra.family/head-protocol/api-reference">
          all events emitted
        </Link>{" "}
        by the Hydra node.
      </p>
      <Codeblock data={code} />
      <p>
        The callback function is typed, so you can access the message properties
        directly.
      </p>
      <Codeblock data={code2} />
    </>
  );
}

function Right(provider: HydraProvider, providerName: string) {
  useEffect(() => {
    provider.onStatusChange((status) => {
      console.log("Hydra status", status);
      if (status === "OPEN") {
        provider.onMessage((message) => {
          console.log("HydraProvider received message:", message);
        });
      }
    });
    provider.onMessage((message) => {
      if (message.tag === "Greetings") {
        message.snapshotUtxo;
        console.log("Greetings", JSON.stringify(message));
      }
    });
  }, [provider]);

  return <></>;
}
