import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { BlockfrostProvider, KoiosProvider } from '@martifylabs/mesh';
import { StakeButton } from '@martifylabs/mesh-react';
import { useEffect, useState } from 'react';

export default function UiStakeButton() {
  return (
    <>
      <SectionTwoCol
        sidebarTo="connectWallet"
        header="Connect Wallet"
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
        A dropdown component which allows the user to select a wallet to
        connect.
      </p>
    </>
  );
}

function Right() {
  let code2 = `import { CardanoWallet } from '@martifylabs/mesh-react';\n\n`;
  code2 += `export default function Page() {\n`;
  code2 += `  return (\n`;
  code2 += `    <>\n`;
  code2 += `      <CardanoWallet />\n`;
  code2 += `    </>\n`;
  code2 += `  );\n`;
  code2 += `}\n`;

  const blockfrostProvider = new BlockfrostProvider(
    process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
  );

  return (
    <Card>
      <Codeblock data={code2} isJson={false} />
      <StakeButton
        onCheck={(address) => blockfrostProvider.fetchAccountInfo(address)}
        poolId="pool1j5ykmf5a87myg947w2svnnj8f3evt8dqmvv624kugv9tcwwk8vr"
      />
    </Card>
  );
}
