import { useState } from "react";

import { useWallet } from "@meshsdk/react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import { demoPolicyId } from "~/data/cardano";

export default function BrowserWalletGetPolicyIdAssets() {
  return (
    <TwoColumnsScroll
      sidebarTo="getPolicyIdAssets"
      title="Get a Collection of Assets"
      leftSection={Left()}
      rightSection={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        This API retrieves a list of assets associated with a specific policy
        ID. If no assets in the wallet belong to the specified policy ID, an
        empty list is returned.
      </p>
      <p>
        Applications can use this API to query assets belonging to a particular
        policy ID, which is useful for managing collections of assets or
        verifying ownership.
      </p>
      <p>
        To obtain a list of all policy IDs in the wallet, use{" "}
        <code>wallet.getPolicyIds()</code>.
      </p>
    </>
  );
}

function Right() {
  const [policyId, setPolicyId] = useState<string>(demoPolicyId);

  const { wallet, connected } = useWallet();

  async function runDemo() {
    let results = await wallet.getPolicyIdAssets(policyId);
    return results;
  }

  return (
    <LiveCodeDemo
      title="Get a Collection of Assets"
      subtitle="Get a list of assets belonging to the policy ID"
      code={`await wallet.getPolicyIdAssets('${policyId}');`}
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
            value={policyId}
            onChange={(e) => setPolicyId(e.target.value)}
            placeholder="Policy ID"
            label="Policy ID"
            key={0}
          />,
        ]}
      />
    </LiveCodeDemo>
  );
}
