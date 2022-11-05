import ButtonGroup from '../ui/buttongroup';
import Codeblock from '../ui/codeblock';
import { useState } from 'react';

export default function BlockchainProviderCodeSnippet() {
  const [blockchainProvider, setBlockchainProvider] = useState('blockfrost');

  let codeBF = `import { BlockfrostProvider } from '@martifylabs/mesh';\n\n`;
  codeBF += `const blockchainProvider = new BlockfrostProvider('<BLOCKFROST_API_KEY>');`;

  let codeKoios = `import { KoiosProvider } from '@martifylabs/mesh';\n\n`;
  codeKoios += `const blockchainProvider = new KoiosProvider('<api,testnet,guild>');`;

  let code = codeBF;
  if (blockchainProvider == 'koios') {
    code = codeKoios;
  }

  return (
    <>
      <ButtonGroup
        items={[
          {
            key: 'blockfrost',
            label: 'Blockfrost',
            onClick: () => setBlockchainProvider('blockfrost'),
          },
          {
            key: 'koios',
            label: 'Koios',
            onClick: () => setBlockchainProvider('koios'),
          },
        ]}
        currentSelected={blockchainProvider}
      />
      <Codeblock data={code} isJson={false} />
    </>
  );
}
