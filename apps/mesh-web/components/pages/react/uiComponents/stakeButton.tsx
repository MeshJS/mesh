import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { KoiosProvider } from '@meshsdk/core';
import { StakeButton } from '@meshsdk/react';
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
    'pool1mhww3q6d7qssj5j2add05r7cyr7znyswe2g6vd23anpx5sh6z8d'
  );
  const [networkId, setNetworkId] =
    useState<'preprod' | 'api' | 'preview' | 'guild'>('api');

  let code2 = ``;
  code2 += `import { KoiosProvider } from '@meshsdk/core';\n`;
  code2 += `import { StakeButton } from '@meshsdk/react';\n`;
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
