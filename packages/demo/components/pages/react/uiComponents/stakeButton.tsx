import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { BlockfrostProvider } from '@martifylabs/mesh';
import { StakeButton } from '@martifylabs/mesh-react';

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
  let code2 = ``;
  code2 += `import { BlockfrostProvider } from '@martifylabs/mesh';\n`;
  code2 += `import { StakeButton } from '@martifylabs/mesh-react';\n`;
  code2 += `\n`;
  code2 += `export default function Page() {\n`;
  code2 += `  // you can use any other providers here, e.g. KoiosProvider\n`;
  code2 += `  const blockchainProvider = new BlockfrostProvider(\n`;
  code2 += `    'YOUR KEY HERE'\n`;
  code2 += `  );\n`;
  code2 += `  return (\n`;
  code2 += `    <StakeButton\n`;
  code2 += `      onCheck={(address) => blockchainProvider.fetchAccountInfo(address)}\n`;
  code2 += `      poolId="pool1j5ykmf5a87myg947w2svnnj8f3evt8dqmvv624kugv9tcwwk8vr"\n`;
  code2 += `    />\n`;
  code2 += `  )\n`;
  code2 += `}\n`;

  const blockchainProvider = new BlockfrostProvider(
    process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
  );

  return (
    <Card>
      <Codeblock data={code2} isJson={false} />
      <StakeButton
        onCheck={(address) => blockchainProvider.fetchAccountInfo(address)}
        poolId="pool1j5ykmf5a87myg947w2svnnj8f3evt8dqmvv624kugv9tcwwk8vr"
      />
    </Card>
  );
}
