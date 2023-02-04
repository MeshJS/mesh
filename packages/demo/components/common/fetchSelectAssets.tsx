import type { AssetExtended } from '@meshsdk/core';
import { useEffect, useState } from 'react';
import { useWallet } from '@meshsdk/react';
import Button from '../ui/button';

export default function FetchSelectAssets({
  index,
  selectedAssets,
  selectAssetFn,
}) {
  const { wallet, connected, connecting } = useWallet();
  const [loadingAssets, setLoadingAssets] = useState<boolean>(false);
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
      assetName: 'CardanoToken',
      fingerprint: 'asset1mdkjgeufm9lk4yzszckq6r7t5p4vzhwz2dz90k',
      quantity: '5',
    },
  ]);

  useEffect(() => {
    async function init() {
      setLoadingAssets(true);
      const assets = await wallet.getAssets();
      setWalletAssets(assets);
      setLoadingAssets(false);
    }
    if (connected) {
      init();
    }
  }, [connected]);

  useEffect(() => {
    if (connecting && !connected) {
      setWalletAssets([]);
    }
  }, [connecting]);

  return (
    <>
      <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
        Select assets
      </label>
      {loadingAssets && <div className="mb-2">Fetching assets...</div>}
      <div className="overflow-y-auto	max-h-96">
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
      </div>
    </>
  );
}
