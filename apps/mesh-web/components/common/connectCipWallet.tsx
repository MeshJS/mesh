import { CardanoWallet, useWalletList } from '@meshsdk/react';

export default function ConnectCipWallet() {
  const wallets = useWalletList();
  const hasAvailableWallets = wallets.length > 0;
  return (
    <>{hasAvailableWallets ? <CardanoWallet /> : <>No wallets installed</>}</>
  );
}
