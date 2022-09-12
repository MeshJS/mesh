import type { AssetExtended } from '@martifylabs/mesh';
import { useState } from 'react';
import useWallet from '../../../../contexts/wallet';
import Button from '../../../ui/button';

export default function FetchSelectAssets({
  index,
  selectedAssets,
  selectAssetFn,
}) {
  const { wallet, walletConnected } = useWallet();
  const [walletAssets, setWalletAssets] = useState<AssetExtended[]>([]);
  const [state, setState] = useState<number>(0);

  async function loadAssets() {
    setState(1);
    const assets = await wallet.getAssets();
    setWalletAssets(assets);
    setState(2);
  }

  return (
    <>
      {walletConnected && (
        <>
          {state == 2 ? (
            <>
              <div className="grid grid-cols-1 px-4 lg:grid-cols-3 lg:gap-4">
                {walletAssets.map((asset, i) => {
                  return (
                    <Button
                      key={i}
                      onClick={() => selectAssetFn(index, asset.unit)}
                      style={
                        asset.unit in selectedAssets &&
                        selectedAssets[asset.unit]
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
          ) : (
            <>
              <Button
                onClick={() => loadAssets()}
                disabled={state == 1}
                style={
                  state == 1 ? 'warning' : state == 2 ? 'success' : 'light'
                }
              >
                Fetch wallet assets
              </Button>
            </>
          )}
        </>
      )}
    </>
  );
}
