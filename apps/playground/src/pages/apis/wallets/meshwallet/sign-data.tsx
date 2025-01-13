import { useState } from "react";

import Input from "~/components/form/input";
import Link from "~/components/link";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import useMeshWallet from "~/contexts/mesh-wallet";

export default function MeshWalletSignData() {
  return (
    <TwoColumnsScroll
      sidebarTo="signData"
      title="Sign Data"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let example = ``;
  example += `{\n`;
  example += `  "signature": "845846a2012...f9119a18e8977d436385cecb08",\n`;
  example += `  "key": "a4010103272006215...b81a7f6ed4fa29cc7b33186c"\n`;
  example += `}\n`;
  return (
    <>
      <p>
        This endpoint utilizes the{" "}
        <Link href="https://cips.cardano.org/cip/CIP-8">
          CIP-8 - Message Signing
        </Link>{" "}
        to sign arbitrary data, to verify the data was signed by the owner of
        the private key.
      </p>
      <p>
        <code>signData</code> takes two arguments, the first one is the payload
        to sign and the second one is the address (optional).
      </p>
      <p>Example of a response from the endpoint:</p>
      <Codeblock data={example} />
      <p>
        Continue reading this{" "}
        <Link href="/guides/prove-wallet-ownership">
          guide
        </Link>{" "}
        to learn how to verify the signature.
      </p>
    </>
  );
}

function Right() {
  const { getWallet } = useMeshWallet();
  const [payload, setPayload] = useState<string>("mesh");

  async function runDemo() {
    const wallet = getWallet();
    return await wallet.signData(payload);
  }

  let code = ``;
  code += `const signature = await wallet.signData('${payload}');`;

  return (
    <LiveCodeDemo
      title="Sign data"
      subtitle="Define a payload and sign it with wallet."
      code={code}
      runCodeFunction={runDemo}
    >
      <InputTable
        listInputs={[
          <Input
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            placeholder="Payload"
            label="Payload"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
