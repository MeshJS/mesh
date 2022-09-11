import { useState, useEffect } from 'react';
import { Button, Card, Codeblock, Input, Textarea } from '../../components';
import useWallet from '../../contexts/wallet';
import ConnectWallet from '../wallet/connectWallet';
import { Transaction, ForgeScript } from '@martifylabs/mesh';
import type { Mint } from '@martifylabs/mesh';
import { LinkCardanoscanTx } from '../blocks/linkCardanoscanTx';

export default function Minting() {
  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>Minting native assets</h3>
          <p>
            With Mesh, we can mint assets with just a few lines of code, and you
            can even use your light wallet (i.e. Eternl) as a minting wallet!
          </p>
          <p>
            In this example, we will mint assets using our connected Browser
            wallet. We choose the first wallet address to get the forging
            script; this address will be used for signing both minting and
            burning transactions. We define the metadata for the native asset
            and create a minting transaction.
          </p>
          <p>
            For NFTs, you can define your metadata however you like with{' '}
            <code>AssetMetadata</code>, by including more attibutes into the
            metadata.
          </p>
        </div>
        <div className="mt-8">
          <CodeDemo />
        </div>
      </div>
    </Card>
  );
}

function CodeDemo() {
  const defaultMetadata = {
    name: 'Mesh Token',
    image: 'ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua',
    mediaType: 'image/jpg',
    description: 'This NFT is minted by Mesh (https://mesh.martify.io/).',
  };
  const { wallet, walletConnected } = useWallet();
  const [state, setState] = useState<number>(0);
  const [result, setResult] = useState<null | string>(null);
  const [assetName, setAssetName] = useState<string>('MeshToken');
  const [assetLabel, setAssetLabel] = useState<'20' | '721'>('721');
  const [metadata, setMetadata] = useState<any>(
    JSON.stringify(defaultMetadata, null, 2)
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [sendAddress, setSendAddress] = useState<string>('');

  useEffect(() => {
    async function init() {
      const usedAddress = await wallet.getUsedAddresses();
      const address = usedAddress[0];
      setSendAddress(address);
    }
    if (walletConnected) {
      init();
    }
  }, [walletConnected]);

  async function makeTransactionMinting() {
    let assetMetadata = undefined;
    try {
      assetMetadata = JSON.parse(metadata);
    } catch (error) {
      setResult('Problem parsing metadata. Must be a valid javascript object.');
    }

    if (assetMetadata == undefined) {
      return;
    }

    try {
      setState(1);
      console.log('makeTransactionMinting');

      // wallet

      const usedAddress = await wallet.getUsedAddresses();
      const address = usedAddress[0];
      const forgingScript = ForgeScript.withOneSignature(address);
      console.log('forgingScript', forgingScript);

      // asset

      // const assetMetadata: AssetMetadata = {
      //   name: 'Mesh Token',
      //   image: 'ipfs://Qmbw8QcgMMdUMnLxjFuxFeXZJxPioXW5WU1UJKwqZgLXNS',
      //   mediaType: 'image/gif',
      //   description: 'This NFT is minted by Mesh (https://mesh.martify.io/).',
      // };

      const asset: Mint = {
        assetName: assetName,
        assetQuantity: quantity.toString(),
        metadata: assetMetadata,
        recipient: { address },
        label: assetLabel,
      };

      // transaction

      const tx = new Transaction({ initiator: wallet });
      // to mint
      tx.mintAsset(forgingScript, asset);

      // to burn
      // const assetToBurn = {
      //   unit: '8f78a4388b1a3e1a1435257e9356fa0c2cc0d3a5999d63b5886c964354657374746f6b656e',
      //   quantity: '1',
      // };
      // tx.burnAsset(forgingScript, assetToBurn);

      const unsignedTx = await tx.build();
      console.log('unsignedTx', unsignedTx);
      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);
      console.log('txHash', txHash);
      setResult(txHash);
      setState(2);
    } catch (error) {
      console.log('error', error);
      setResult(`${error}`);
      setState(0);
    }
  }

  let _metadata = JSON.stringify({ error: 'Not a valid javascript object' }, null, 2);
  try {
    _metadata = JSON.stringify(JSON.parse(metadata), null, 2);
  } catch (error) {}

  let codeSnippet1 = `import { Transaction, ForgeScript } from '@martifylabs/mesh';\n`;
  codeSnippet1 += `import type { Mint, AssetMetadata } from '@martifylabs/mesh';\n\n`;

  codeSnippet1 += `const assetMetadata: AssetMetadata = ${_metadata};\n`;
  codeSnippet1 += `const asset: Mint = {\n`;
  codeSnippet1 += `  assetName: "${assetName}",\n`;
  codeSnippet1 += `  assetQuantity: "${quantity}",\n`;
  codeSnippet1 += `  metadata: assetMetadata,\n`;
  codeSnippet1 += `  label: "${assetLabel}",\n`;
  codeSnippet1 += `};\n\n`;

  codeSnippet1 += `const usedAddress = await wallet.getUsedAddresses();\n`;
  codeSnippet1 += `const address = usedAddress[0];\n`;
  codeSnippet1 += `const forgingScript = ForgeScript.withOneSignature(address);\n\n`;

  codeSnippet1 += `const tx = new Transaction({ initiator: wallet })\n`;
  codeSnippet1 += `  .mintAsset(forgingScript, "${sendAddress}", asset);\n`;

  codeSnippet1 += `const unsignedTx = await tx.build();\n`;
  codeSnippet1 += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet1 += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <>
      {walletConnected && (
        <table className="tableForInputs not-format">
          <tbody>
            <tr>
              <td className="py-4 px-4 w-1/4">Asset name</td>
              <td className="py-4 px-4 w-3/4">
                <Input
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  placeholder="asset name, alphanumeric only, no spaces"
                />
              </td>
            </tr>
            <tr>
              <td className="py-4 px-4 w-1/4">Metadata</td>
              <td className="py-4 px-4 w-3/4">
                <Textarea
                  value={metadata}
                  onChange={(e) => setMetadata(e.target.value)}
                  rows={8}
                />
              </td>
            </tr>
            <tr>
              <td className="py-4 px-4 w-1/4">Asset label</td>
              <td className="py-4 px-4 w-3/4">
                <div className="flex items-center mb-4">
                  <input
                    id="assetlabel-radio-1"
                    type="radio"
                    value="721"
                    name="assetlabel-radio"
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    checked={assetLabel === '721'}
                    onChange={(e) => setAssetLabel('721')}
                  />
                  <label
                    htmlFor="assetlabel-radio-1"
                    className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
                  >
                    Non fungible asset (721)
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    id="assetlabel-radio-2"
                    type="radio"
                    value="20"
                    name="assetlabel-radio"
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    checked={assetLabel === '20'}
                    onChange={(e) => setAssetLabel('20')}
                  />
                  <label
                    htmlFor="assetlabel-radio-2"
                    className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
                  >
                    Fungible asset (20)
                  </label>
                </div>
              </td>
            </tr>
            <tr>
              <td className="py-4 px-4 w-1/4">Quantity</td>
              <td className="py-4 px-4 w-3/4">
                <Input
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="number of asset to mint"
                />
              </td>
            </tr>
            <tr>
              <td className="py-4 px-4 w-1/4">Address</td>
              <td className="py-4 px-4 w-3/4">
                <Input
                  value={sendAddress}
                  onChange={(e) => setSendAddress(e.target.value)}
                  placeholder="send asset to address"
                />
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <Codeblock data={codeSnippet1} isJson={false} />

      {walletConnected ? (
        <Button
          onClick={() => makeTransactionMinting()}
          disabled={state == 1}
          style={state == 1 ? 'warning' : state == 2 ? 'success' : 'light'}
        >
          Run code snippet to mint asset
        </Button>
      ) : (
        <ConnectWallet />
      )}

      {result && (
        <>
          <h4>Result</h4>
          <Codeblock data={result} />
          {state == 4 && <LinkCardanoscanTx txHash={result} />}
        </>
      )}
    </>
  );
}
