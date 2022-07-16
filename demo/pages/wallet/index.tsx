import { useState } from "react";
import { Metatags } from "../../components";
import ConnectWallet from "./connectWallet";
import WalletApi from "./walletApi";

const Wallet = () => {
  const [walletConnected, setWalletConnected] = useState<null | string>(null);
  return (
    <div className="mt-32 prose prose-slate mx-auto lg:prose-lg">
      <Metatags title="Wallet APIs" />
      <h1>Wallet APIs</h1>
      <p className="lead">
        In this section, you can connect wallet and try APIs for dApps to
        communicate with your wallet.
      </p>
      <ConnectWallet
        walletConnected={walletConnected}
        setWalletConnected={setWalletConnected}
      />
      {walletConnected && (
        <>
          <WalletApi />
        </>
      )}
    </div>
  );
};

export default Wallet;
