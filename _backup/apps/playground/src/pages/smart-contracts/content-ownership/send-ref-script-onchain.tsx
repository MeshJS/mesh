import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import Select from "~/components/form/select";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import {
  getContract,
  InputsOperationAddress,
  InputsParamUtxo,
  useContentOwnership,
} from "./common";

export default function OwnershipSendRefScriptOnchain() {
  return (
    <TwoColumnsScroll
      sidebarTo="sendRefScriptOnchain"
      title="Send Ref-Script Onchain"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        This are the next transactions you need to setup the contract. You need
        to run once for each script, and you would likely have to run one after
        the previous one is confirmed.
      </p>
      <p>
        This transaction sends the reference scripts to the blockchain for later
        transactions, boosting efficiency and avoid exceeding 16kb of
        transaction size limits enforced by protocol parameter.
      </p>
      <p>
        <b>Note:</b> You must provide the <code>paramUtxo</code> from the{" "}
        <code>mintOneTimeMintingPolicy</code> transaction.
      </p>
      <p>
        <b>Note:</b> You must save txHash (after signed and submitted) for
        <code>ContentRegistry</code>, <code>ContentRefToken</code>,{" "}
        <code>OwnershipRegistry</code>,<code>OwnershipRefToken</code>{" "}
        transactions for future transactions.
      </p>
    </>
  );
}

function Right() {
  const { wallet, connected } = useWallet();
  const operationAddress = useContentOwnership(
    (state) => state.operationAddress,
  );
  const paramUtxo = useContentOwnership((state) => state.paramUtxo);

  const [scriptIndex, setScriptIndex] = useState<
    | "OracleNFT"
    | "OracleValidator"
    | "ContentRegistry"
    | "ContentRefToken"
    | "OwnershipRegistry"
    | "OwnershipRefToken"
  >("OracleNFT");

  async function runDemo() {
    const contract = getContract(
      wallet,
      operationAddress,
      JSON.parse(paramUtxo) as { outputIndex: number; txHash: string },
    );
    const tx = await contract.sendRefScriptOnchain(scriptIndex);
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const tx = await contract.sendRefScriptOnchain('${scriptIndex}');\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Send Ref-Script Onchain"
      subtitle="This transaction sends the reference scripts to the blockchain for later transactions."
      runCodeFunction={runDemo}
      code={code}
      disabled={!connected}
      runDemoButtonTooltip={
        !connected ? "Connect wallet to run this demo" : undefined
      }
      runDemoShowBrowseWalletConnect={true}
    >
      <InputsOperationAddress />
      <InputsParamUtxo />
      <InputTable
        listInputs={[
          <Select
            id="choose"
            options={{
              OracleNFT: "OracleNFT",
              OracleValidator: "OracleValidator",
              ContentRegistry: "ContentRegistry",
              ContentRefToken: "ContentRefToken",
              OwnershipRegistry: "OwnershipRegistry",
              OwnershipRefToken: "OwnershipRefToken",
            }}
            value={scriptIndex}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setScriptIndex(
                e.target.value as
                  | "OracleNFT"
                  | "OracleValidator"
                  | "ContentRegistry"
                  | "ContentRefToken"
                  | "OwnershipRegistry"
                  | "OwnershipRefToken",
              )
            }
            label="Select script index"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
