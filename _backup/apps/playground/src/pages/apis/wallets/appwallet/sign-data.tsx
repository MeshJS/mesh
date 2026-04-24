import { useState } from "react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import useAppWallet from "~/contexts/app-wallet";

export default function AppWalletSignData() {
  const [payload, setPayload] = useState<string>("mesh");

  return (
    <TwoColumnsScroll
      sidebarTo="signData"
      title="Sign Data"
      leftSection={Left()}
      rightSection={Right(payload, setPayload)}
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
        Sign data allows you to sign a payload to identify the wallet ownership.
      </p>

      <p>Example of a response from the endpoint:</p>
      <Codeblock data={example} />
    </>
  );
}

function Right(payload: string, setPayload: (payload: string) => void) {
  const { wallet, walletConnected } = useAppWallet();

  async function runDemo() {
    const address = wallet.getPaymentAddress();
    const signature = await wallet.signData(address, payload);
    return signature;
  }

  let code = `const address = wallet.getPaymentAddress();\n`;
  code += `const signature = await wallet.signData((address, '${payload}');`;

  return (
    <LiveCodeDemo
      title="Sign data"
      subtitle="Define a payload and sign it with wallet."
      code={code}
      runCodeFunction={runDemo}
      disabled={!walletConnected}
      runDemoButtonTooltip={
        !walletConnected ? "Connect wallet to run this demo" : undefined
      }
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
