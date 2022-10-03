import ButtonGroup from '../../../ui/buttongroup';
import Codeblock from '../../../ui/codeblock';
import useLocalStorage from '../../../../hooks/useLocalStorage';

export default function BlockchainProviderCodeSnippet() {
  const [blockchainProvider, setBlockchainProvider] = useLocalStorage(
    'blockchainProvider',
    'blockfrost'
  );

  let codeBF = `import { BlockfrostProvider } from '@martifylabs/mesh';\n\n`;
  codeBF += `const blockchainProvider = new BlockfrostProvider(\n`;
  codeBF += `  '<BLOCKFROST_API_KEY>',\n`;
  codeBF += `);`;

  let codeKoios = `import { KoiosProvider } from '@martifylabs/mesh';\n\n`;
  codeKoios += `const blockchainProvider = new KoiosProvider(\n`;
  codeKoios += `  '<api,testnet,guild>'\n`;
  codeKoios += `);`;

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
