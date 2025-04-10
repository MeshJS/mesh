import { useState } from "react";

import { InitWeb3WalletOptions, Web3Wallet } from "@meshsdk/web3-sdk";

import IconDiscord from "../common/icons/icon-discord";
import IconGoogle from "../common/icons/icon-google";
import IconTwitter from "../common/icons/icon-twitter";
import { useWallet } from "../hooks";
import WalletIcon from "./wallet-icon";

export default function Web3Services({
  options,
  setOpen,
  persist,
}: {
  options: InitWeb3WalletOptions;
  setOpen: Function;
  persist: boolean;
}) {
  const { setWallet } = useWallet();
  const [loading, setLoading] = useState(false);

  async function loadWallet() {
    setLoading(true);
    const _options: InitWeb3WalletOptions = {
      networkId: 0,
      fetcher: options.fetcher,
      submitter: options.submitter,
      appUrl: options.appUrl,
      projectId: options.projectId,
    };
    const wallet = await Web3Wallet.enable(_options);

    setWallet(
      wallet,
      "Mesh Web3 Services",
      persist
        ? {
            walletAddress: await wallet.getChangeAddress(),
          }
        : undefined,
    );
    setLoading(false);
    setOpen(false);
  }

  return (
    <>
      <WalletIcon
        iconReactNode={IconGoogle()}
        name={`Google`}
        action={() => loadWallet()}
        loading={loading}
      />
      <WalletIcon
        iconReactNode={IconDiscord()}
        name={`Discord`}
        action={() => loadWallet()}
        loading={loading}
      />
      <WalletIcon
        iconReactNode={IconTwitter()}
        name={`Twitter`}
        action={() => loadWallet()}
        loading={loading}
      />
    </>
  );
}
