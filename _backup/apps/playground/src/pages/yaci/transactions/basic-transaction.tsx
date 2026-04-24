import { useState } from "react";

import { MeshWallet, Transaction, YaciProvider } from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { yaci } from "~/data/cardano";

export default function YaciBasicTransaction() {
  return (
    <TwoColumnsScroll
      sidebarTo="transaction"
      title="Basic Transaction"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeWallet = ``;
  codeWallet += `const provider = new YaciProvider();\n`;
  codeWallet += `\n`;
  codeWallet += `const wallet = new MeshWallet({\n`;
  codeWallet += `  networkId: 0,\n`;
  codeWallet += `  fetcher: provider,\n`;
  codeWallet += `  submitter: provider,\n`;
  codeWallet += `  key: {\n`;
  codeWallet += `    type: "mnemonic",\n`;
  codeWallet += `    words: demoMnemonic,\n`;
  codeWallet += `  },\n`;
  codeWallet += `});\n`;

  let codeTransaction = ``;
  codeTransaction += `const tx = new Transaction({ initiator: wallet });\n`;
  codeTransaction += `tx.sendLovelace('<recipient address>', "1000000");\n`;
  codeTransaction += `\n`;
  codeTransaction += `const unsignedTx = await tx.build();\n`;
  codeTransaction += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeTransaction += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <>
      <p>
        We import a wallet, for example<code>MeshWallet</code> with{" "}
        <code>YaciProvider</code> as the <code>fetcher</code> and{" "}
        <code>submitter</code>:
      </p>
      <Codeblock data={codeWallet} />
      <p>
        Next, we create a transaction and send 1 ADA to the recipient address.
      </p>
      <Codeblock data={codeTransaction} />

      <p>
        Note: for this transaction to work, you must have a Yaci devnet running
        and the wallet is funded. You can topup ADA in your wallet by running
        the following command from devnet:
      </p>
      <Codeblock data={`devnet:default>topup ${yaci.address} 1000`} />
    </>
  );
}

function Right() {
  const [userInput, setUserInput] = useState<string>(yaci.address);
  const [userInput2, setUserInput2] = useState<string>(
    "https://yaci-node.meshjs.dev/api/v1/",
  );

  async function runDemo() {
    const provider = new YaciProvider(userInput2);

    const wallet = new MeshWallet({
      networkId: 0,
      fetcher: provider,
      submitter: provider,
      key: {
        type: "mnemonic",
        words: yaci.mnemonic,
      },
    });

    const tx = new Transaction({ initiator: wallet }).setNetwork("preprod");
    tx.sendLovelace(userInput, "1000000");

    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  }

  let code = `import { YaciProvider } from "@meshsdk/core";\n\n`;
  code += `const provider = new YaciProvider('${userInput2}');\n`;
  code += `const utxos = await provider.fetchAddressUTxOs('${userInput}');\n`;

  return (
    <LiveCodeDemo
      title="Get UTxOs"
      subtitle="Fetch UTxOs of an address. Note: your Yaci devnet must be running."
      runCodeFunction={runDemo}
      code={code}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Recipient Address"
            label="Recipient Address"
            key={0}
          />,
          <Input
            value={userInput2}
            onChange={(e) => setUserInput2(e.target.value)}
            placeholder="Yaci URL"
            label="Yaci URL"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
