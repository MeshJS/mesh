import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import { getContract } from "./common";

export default function HelloWorldUnlock() {
  return (
    <TwoColumnsScroll
      sidebarTo="unlockAsset"
      title="Unlock Assets"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let codeValidator = ``;
  codeValidator += `validator hello_world {\n`;
  codeValidator += `  spend(\n`;
  codeValidator += `    datum_opt: Option<Datum>,\n`;
  codeValidator += `    redeemer: Redeemer,\n`;
  codeValidator += `    _input: OutputReference,\n`;
  codeValidator += `    tx: Transaction,\n`;
  codeValidator += `  ) {\n`;
  codeValidator += `    expect Some(datum) = datum_opt\n`;
  codeValidator += `    let must_say_hello = redeemer.msg == "Hello, World!"\n`;
  codeValidator += `    let must_be_signed = list.has(tx.extra_signatories, datum.owner)\n`;
  codeValidator += `    must_say_hello && must_be_signed\n`;
  codeValidator += `  }\n`;
  codeValidator += `\n`;
  codeValidator += `  else(_) {\n`;
  codeValidator += `    fail\n`;
  codeValidator += `  }\n`;
  codeValidator += `}\n`;

  return (
    <>
      <p>There are 2 conditions to unlock the assets:</p>
      <ul>
        <li>Signer must be the same as the one who locked the assets</li>
        <li>
          Signer must provide the message <code>Hello, World!</code>
        </li>
      </ul>

      <p>
        The validator script for the contract checks that the redeemer is the
        same as the owner of the datum and that the message is{" "}
        <code>Hello, World!</code>:
      </p>

      <Codeblock data={codeValidator} />
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const [userInput, setUserInput] = useState<string>("");
  const [userInput2, setUserInput2] = useState<string>("Hello, World!");

  async function runDemo() {
    const contract = getContract(wallet);

    const utxo = await contract.getUtxoByTxHash(userInput);

    if (utxo === undefined) throw new Error("UTxO not found");

    const tx = await contract.unlockAsset(utxo, userInput2);
    const signedTx = await wallet.signTx(tx, true);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const utxo = await contract.getUtxoByTxHash('${userInput}');\n`;
  code += `\n`;
  code += `const tx = await contract.unlockAsset(utxo, '${userInput2}');\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Redeem Giftcard"
      subtitle="Redeem a gift card given the gift card UTxO"
      runCodeFunction={runDemo}
      code={code}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    >
      <InputTable
        listInputs={[
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Tx hash"
            label="Tx hash"
            key={0}
          />,
          <Input
            value={userInput2}
            onChange={(e) => setUserInput2(e.target.value)}
            placeholder="Message"
            label="Message"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
