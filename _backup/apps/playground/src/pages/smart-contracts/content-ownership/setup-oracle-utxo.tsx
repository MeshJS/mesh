import { useWallet } from "@meshsdk/react";

import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import {
  getContract,
  InputsOperationAddress,
  InputsParamUtxo,
  useContentOwnership,
} from "./common";

export default function OwnershipSetupOracleUtxo() {
  return (
    <TwoColumnsScroll
      sidebarTo="setupOracleUtxo"
      title="Setup Oracle Utxo"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        This transaction send the NFT to a oracle contract locking the datum,
        which serves as the single source of truth for the contract oracle with
        data integrity.
      </p>
      <p>This is the second transaction you need to setup the contract.</p>
      <p>
        <b>Note:</b> You must provide the <code>paramUtxo</code> from the{" "}
        <code>mintOneTimeMintingPolicy</code> transaction.
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

  async function runDemo() {
    const contract = getContract(
      wallet,
      operationAddress,
      JSON.parse(paramUtxo) as { outputIndex: number; txHash: string },
    );
    const tx = await contract.setupOracleUtxo();
    const signedTx = await wallet.signTx(tx);
    const txHash = await wallet.submitTx(signedTx);
    return txHash;
  }

  let code = ``;
  code += `const tx = await contract.setupOracleUtxo();\n`;
  code += `const signedTx = await wallet.signTx(tx);\n`;
  code += `const txHash = await wallet.submitTx(signedTx);\n`;

  return (
    <LiveCodeDemo
      title="Setup Oracle Utxo"
      subtitle="This transaction send the NFT to a oracle contract locking the datum."
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
    </LiveCodeDemo>
  );
}
