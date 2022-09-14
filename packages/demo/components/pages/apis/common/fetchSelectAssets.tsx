import type { AssetExtended } from '@martifylabs/mesh';
import { useEffect, useState } from 'react';
import useWallet from '../../../../contexts/wallet';
import Button from '../../../ui/button';

export default function FetchSelectAssets({
  index,
  selectedAssets,
  selectAssetFn,
}) {
  const { wallet, walletConnected } = useWallet();
  // const [state, setState] = useState<number>(0);
  const [walletAssets, setWalletAssets] = useState<AssetExtended[]>([
    {
      unit: '64af286e2ad0df4de2e7de15f8ff5b3d27faecf4ab2757056d860a424d657368546f6b656e',
      policyId: '64af286e2ad0df4de2e7de15f8ff5b3d27faecf4ab2757056d860a42',
      assetName: 'MeshToken',
      fingerprint: 'asset1vy4dlqfc42r49jtvz5v4ek3s7wz96s0azur5xx',
      quantity: '10',
    },
    {
      unit: '8f78a4388b1a3e1a1435257e9356fa0c2cc0d3a5999d63b5886c964354657374746f6b656e',
      policyId: '8f78a4388b1a3e1a1435257e9356fa0c2cc0d3a5999d63b5886c9643',
      assetName: 'MartifyToken',
      fingerprint: 'asset1mdkjgeufm9lk4yzszckq6r7t5p4vzhwz2dz90k',
      quantity: '5',
    },
  ]);

  async function loadAssets() {
    // setState(1);
    const assets = await wallet.getAssets();
    setWalletAssets(assets);
    // setState(2);
  }

  useEffect(() => {
    async function init() {
      await loadAssets();
    }
    if (walletConnected) {
      init();
    }
  }, [walletConnected]);

  return (
    <>
      <div className="grid grid-cols-1 px-4 lg:grid-cols-2 lg:gap-2">
        {walletAssets.map((asset, i) => {
          return (
            <Button
              key={i}
              onClick={() => selectAssetFn(index, asset.unit)}
              className="truncate"
              style={
                asset.unit in selectedAssets && selectedAssets[asset.unit]
                  ? 'success'
                  : 'light'
              }
            >
              {asset.assetName}
            </Button>
          );
        })}
      </div>
    </>
  );

  // return (
  //   <>
  //     {walletConnected && (
  //       <>
  //         {state == 2 ? (
  //           <>
  //             <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4">
  //               {walletAssets.map((asset, i) => {
  //                 return (
  //                   <Button
  //                     key={i}
  //                     onClick={() => selectAssetFn(index, asset.unit)}
  //                     style={
  //                       asset.unit in selectedAssets &&
  //                       selectedAssets[asset.unit]
  //                         ? 'success'
  //                         : 'light'
  //                     }
  //                   >
  //                     {asset.assetName}
  //                   </Button>
  //                 );
  //               })}
  //             </div>
  //           </>
  //         ) : (
  //           <>
  //             <Button
  //               onClick={() => loadAssets()}
  //               disabled={state == 1}
  //               style={
  //                 state == 1 ? 'warning' : state == 2 ? 'success' : 'light'
  //               }
  //             >
  //               Fetch wallet assets
  //             </Button>
  //           </>
  //         )}
  //       </>
  //     )}
  //   </>
  // );
}
