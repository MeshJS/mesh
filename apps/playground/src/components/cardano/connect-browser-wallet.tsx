import { CardanoWallet, useWalletList } from "@meshsdk/react";

export default function ConnectBrowserWallet() {
  const wallets = useWalletList();
  const hasAvailableWallets = wallets.length > 0;
  return (
    <>
      {hasAvailableWallets ? (
        <CardanoWallet extensions={[95]} />
      ) : (
        <>No wallets installed</>
      )}
    </>
  );
}
