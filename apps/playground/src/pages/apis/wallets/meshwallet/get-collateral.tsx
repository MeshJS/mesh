import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";
import useMeshWallet from "~/contexts/mesh-wallet";
import { AboutGetAddressType } from "./common";

export default function MeshWalletGetCollateral() {
  return (
    <TwoColumnsScroll
      sidebarTo="getCollateral"
      title="Get Collateral"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  let example = ``;
  example += `[\n`;
  example += `  {\n`;
  example += `    "input": {\n`;
  example += `      "outputIndex": 1,\n`;
  example += `      "txHash": "ff8d1e97c60989b4f...02ee937595ad741ff597af1"\n`;
  example += `    },\n`;
  example += `    "output": {\n`;
  example += `      "address": "addr_test1qzm...z0fr8c3grjmysm5e6yx",\n`;
  example += `      "amount": [ { "unit": "lovelace", "quantity": "5000000" } ]\n`;
  example += `    }\n`;
  example += `  }\n`;
  example += `]\n`;
  return (
    <>
      <p>
        This function shall return a list of one or more UTXOs (unspent
        transaction outputs) controlled by the wallet that are required to reach
        AT LEAST the combined ADA value target specified in amount AND the best
        suitable to be used as collateral inputs for transactions with plutus
        script inputs (pure ADA-only UTXOs).
      </p>
      <p>
        If this cannot be attained, an error message with an explanation of the
        blocking problem shall be returned. NOTE: wallets are free to return
        UTXOs that add up to a greater total ADA value than requested in the
        amount parameter, but wallets must never return any result where UTXOs
        would sum up to a smaller total ADA value, instead in a case like that
        an error message must be returned.
      </p>
      <p>Example of a response returned by this endpoint:</p>
      <Codeblock data={example} />

      <AboutGetAddressType />
    </>
  );
}

function Right() {
  const { getWallet } = useMeshWallet();
  async function runDemo() {
    const wallet = getWallet();
    let results = await wallet.getCollateral();
    return results;
  }
  return (
    <LiveCodeDemo
      title="Get Collateral"
      subtitle="Get list of UTXOs that used as collateral inputs for transactions
            with plutus script inputs"
      code={`const collateralUtxos = await wallet.getCollateral();`}
      runCodeFunction={runDemo}
    />
  );
}
