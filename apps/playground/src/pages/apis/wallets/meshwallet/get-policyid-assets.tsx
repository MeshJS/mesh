import { useState } from "react";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import LiveCodeDemo from "~/components/sections/live-code-demo";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import useMeshWallet from "~/contexts/mesh-wallet";
import { demoPolicyId } from "~/data/cardano";

export default function MeshWalletGetPolicyIdAssets() {
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
        Returns a list of assets from a policy ID. If no assets in wallet
        belongs to the policy ID, an empty list is returned. Query for a list of
        assets&apos; policy ID with <code>wallet.getPolicyIds()</code>.
      </p>
    </>
  );
}

function Right() {
  const { getWallet } = useMeshWallet();

  const [policyId, setPolicyId] = useState<string>(demoPolicyId);

  async function runDemo() {
    const wallet = getWallet();
    let results = await wallet.getPolicyIdAssets(policyId);
    return results;
  }

  return (
    <LiveCodeDemo
      title="Get a Collection of Assets"
      subtitle="Get a list of assets belonging to the policy ID"
      code={`const assets = await wallet.getPolicyIdAssets('${policyId}');`}
      runCodeFunction={runDemo}
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
