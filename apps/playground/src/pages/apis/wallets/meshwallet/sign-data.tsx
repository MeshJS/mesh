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
        This API allows applications to request the signing of arbitrary data
        using the private keys managed by the connected wallet. This is useful
        for verifying the authenticity of data or creating cryptographic proofs.
      </p>
      <p>
        The wallet ensures that the signing process is secure and that private
        keys are not exposed during the operation. The signed data can be used
        for various purposes, such as authentication, data integrity checks, or
        blockchain interactions.
      </p>
      <p>
        This functionality is essential for applications that require secure and
        verifiable data signing capabilities.
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
