import { useState } from 'react';
import { Button, Card, Codeblock, Input } from '../../components';
import useWallet from '../../contexts/wallet';
import ConnectWallet from '../wallet/connectWallet';
import { Transaction, ForgeScript } from '@martifylabs/mesh';
import { LinkCardanoscanTx } from '../blocks/linkCardanoscanTx';
import { AssetsContainer } from '../blocks/assetscontainer';

export default function Burning() {
  return (
    <Card>
      <div className="grid gap-4 grid-cols-2">
        <div className="">
          <h3>Burning native assets</h3>
          <p>
            In this example, we will burn the asset that was minted in the above
            demo. We choose the first wallet address to get the forging script,
            pick the asset to burn, and create a transaction to burn the
            selected asset.
          </p>
          <p>
            Note that, assets can only be burned by the minting address (using
            the same forging script used during minting).
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
  const { wallet, walletConnected } = useWallet();
  const [state, setState] = useState<number>(0);
  const [result, setResult] = useState<null | string>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedAsset, setSelectedAsset] = useState<string>('');

  async function makeTransactionBurning() {
    try {
      setState(1);
      console.log('makeTransactionBurning');

      // wallet

      const usedAddress = await wallet.getUsedAddresses();
      const address = usedAddress[0];
      const forgingScript = ForgeScript.withOneSignature(address);
      console.log('forgingScript', forgingScript);

      // transaction

      const tx = new Transaction({ initiator: wallet });
      const assetToBurn = {
        unit: selectedAsset,
        quantity: quantity.toString(),
      };
      tx.burnAsset(forgingScript, assetToBurn);

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

  function toggleSelectedAssets(index, asset) {
    setSelectedAsset(asset.unit);
  }

  let _assetToBurn = {
    unit: selectedAsset.length > 0 ? selectedAsset : 'ASSET UNIT HERE',
    quantity: quantity.toString(),
  };

  let codeSnippet1 = `import { Transaction, ForgeScript } from '@martifylabs/mesh';\n`;
  codeSnippet1 += `import type { AssetRaw, AssetMetadata } from '@martifylabs/mesh';\n\n`;

  codeSnippet1 += `const usedAddress = await wallet.getUsedAddresses();\n`;
  codeSnippet1 += `const address = usedAddress[0];\n`;
  codeSnippet1 += `const forgingScript = ForgeScript.withOneSignature(address);\n\n`;

  codeSnippet1 += `const assetToBurn = ${JSON.stringify(
    _assetToBurn,
    null,
    2
  )}\n\n`;

  codeSnippet1 += `const tx = new Transaction({ initiator: wallet })\n`;
  codeSnippet1 += `  .burnAsset(forgingScript, assetToBurn);\n`;

  codeSnippet1 += `const unsignedTx = await tx.build();\n`;
  codeSnippet1 += `const signedTx = await wallet.signTx(unsignedTx);\n`;
  codeSnippet1 += `const txHash = await wallet.submitTx(signedTx);`;

  return (
    <>
      {walletConnected && (
        <table className="tableForInputs not-format">
          <tbody>
            <tr>
              <td className="py-4 px-4 w-1/4">Asset to burn</td>
              <td className="py-4 px-4 w-3/4">
                <AssetsContainer
                  index={0}
                  selectedAssets={{
                    [selectedAsset]: 1,
                  }}
                  toggleSelectedAssets={toggleSelectedAssets}
                />
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
          </tbody>
        </table>
      )}

      <Codeblock data={codeSnippet1} isJson={false} />

      {walletConnected ? (
        <Button
          onClick={() => makeTransactionBurning()}
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
          <h4>Result from unlock assets</h4>
          <Codeblock data={result} />
          {state == 4 && <LinkCardanoscanTx txHash={result} />}
        </>
      )}
    </>
  );
}
