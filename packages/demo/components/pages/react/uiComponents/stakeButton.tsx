import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { KoiosProvider } from 'meshjs';
import { StakeButton } from 'meshjs-react';
import { useState } from 'react';
import Input from '../../../ui/input';
import Select from '../../../ui/select';

export default function UiStakeButton() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="stakeButton"
        header="Stake ADA"
        leftFn={Left()}
        rightFn={Right()}
      />
    </>
  );
}

function Left() {
  return (
    <>
      <p>
        Delegation is the process by which ADA holders delegate the stake
        associated with their ADA to a stake pool. It allows ADA holders to
        participate in the network and be rewarded in proportion to the amount
        of stake delegated.
      </p>
      <p>
        Put this <code>StakeButton</code> on your website to allow anyone to
        delegate their ADA to your stake pool.
      </p>
    </>
  );
}

function Right() {
  const [poolId, setPoolId] = useState(
    'pool1j5ykmf5a87myg947w2svnnj8f3evt8dqmvv624kugv9tcwwk8vr'
  );
  const [networkId, setNetworkId] =
    useState<'preprod' | 'api' | 'preview' | 'guild'>('preprod');

  let code2 = ``;
  code2 += `import { KoiosProvider } from 'meshjs';\n`;
  code2 += `import { StakeButton } from 'meshjs-react';\n`;
  code2 += `\n`;
  code2 += `export default function Page() {\n`;
  code2 += `  // you can use any other providers here, e.g. BlockfrostProvider\n`;
  code2 += `  const blockchainProvider = new KoiosProvider('${networkId}');\n`;
  code2 += `  return (\n`;
  code2 += `    <StakeButton\n`;
  code2 += `      onCheck={(address) => blockchainProvider.fetchAccountInfo(address)}\n`;
  code2 += `      poolId="${poolId}"\n`;
  code2 += `    />\n`;
  code2 += `  )\n`;
  code2 += `}\n`;

  const blockchainProvider = new KoiosProvider(networkId);

  const options = {
    api: 'api',
    preview: 'preview',
    preprod: 'preprod',
    guild: 'guild',
  };

  return (
    <Card>
      <Codeblock data={code2} isJson={false} />
      <Select
        id="network"
        options={options}
        value={networkId}
        onChange={(e) => setNetworkId(e.target.value)}
        label="Select Koios network"
      />
      <Input
        value={poolId}
        onChange={(e) => setPoolId(e.target.value)}
        placeholder="Pool ID"
        label="Pool ID"
      />
      <StakeButton
        onCheck={(address) => blockchainProvider.fetchAccountInfo(address)}
        poolId={poolId}
      />
    </Card>
  );
}
