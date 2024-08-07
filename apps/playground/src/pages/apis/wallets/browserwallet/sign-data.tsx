import { useState } from "react";
import Link from "next/link";

import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function BrowserWalletSignData() {
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
        <Link
          href="https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030"
          target="_blank"
          rel="noreferrer"
        >
          CIP-8 - Message Signing
        </Link>{" "}
        to sign arbitrary data, to verify the data was signed by the owner of
        the private key.
      </p>
      <p>
        Here, we get the first wallet's address with{" "}
        <code>wallet.getUsedAddresses()</code>, alternativelly you can use
        reward addresses (<code>getRewardAddresses()</code>) too. It's really up
        to you as the developer which address you want to use in your
        application.
      </p>
      <p>Example of a response from the endpoint:</p>
      <Codeblock data={example} />
      <p>
        Continue reading this{" "}
        <Link href="https://meshjs.dev/guides/prove-wallet-ownership">
          guide
        </Link>{" "}
        to learn how to verify the signature.
      </p>
    </>
  );
}

function Right() {
  const [payload, setPayload] = useState<string>("mesh");

  const { wallet, connected } = useWallet();

  async function runDemo() {
    const addresses = await wallet.getUsedAddresses();
    const address = addresses[0];
    return await wallet.signData(address!, payload);
  }

  let code = ``;
  code += `const addresses = await wallet.getUsedAddresses();\n`;
  code += `const address = addresses[0];\n`;
  code += `const signature =  await wallet.signData(address, ${payload});\n`;

  return (
    <LiveCodeDemo
      title="Sign data"
      subtitle="Define a payload and sign it with wallet."
      code={code}
      runCodeFunction={runDemo}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
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

  // return (
  //   <Card>
  //     <div className="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
  //       Sign Data
  //       "
  //     subtitle="Use connected wallet to sign a payload
  //       </p>
  //     </div>
  //     <Input
  //       value={payload}
  //       onChange={(e) => setPayload(e.target.value)}
  //       placeholder="Payload"
  //       label="Payload"
  //     />
  //     <Codeblock data={code} />
  //     <RunDemoButton
  //       runDemoFn={runDemo}
  //       loading={loading}
  //       response={response}
  //     />
  //     <RunDemoResult response={response} />
  //   </Card>
  // );
}
