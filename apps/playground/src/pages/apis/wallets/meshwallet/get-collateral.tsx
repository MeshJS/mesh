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
  example += `[
`;
  example += `  {
`;
  example += `    "input": {
`;
  example += `      "outputIndex": 1,
`;
  example += `      "txHash": "ff8d1e97c60989b4f...02ee937595ad741ff597af1"
`;
  example += `    },
`;
  example += `    "output": {
`;
  example += `      "address": "addr_test1qzm...z0fr8c3grjmysm5e6yx",
`;
  example += `      "amount": [ { "unit": "lovelace", "quantity": "5000000" } ]
`;
  example += `    }
`;
  example += `  }
`;
  example += `]
`;
  return (
    <>
      <p>
        This API retrieves a list of UTXOs (unspent transaction outputs) controlled by the wallet that are suitable for use as collateral inputs in transactions involving Plutus script inputs. Collateral UTXOs are pure ADA-only UTXOs required to meet the specified ADA value target.
      </p>
      <p>
        If the target cannot be met, an error message explaining the issue will be returned. Wallets may return UTXOs exceeding the target value but must never return UTXOs below the specified value.
      </p>
      <p>Example response:</p>
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
