import { useState } from "react";

import { InitWeb3WalletOptions, Web3Wallet } from "@meshsdk/web3-sdk";

import IconDiscord from "../common/icons/icon-discord";
import { useWallet } from "../hooks";
import WalletIcon from "./wallet-icon";

export default function Web3Services({
  options,
  setOpen,
}: {
  options: InitWeb3WalletOptions;
  setOpen: Function;
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

    setWallet(wallet, "Mesh Web3 Services");
    setLoading(false);
    setOpen(false);
  }

  return (
    <WalletIcon
      iconReactNode={IconDiscord()}
      name={`Discord`}
      action={() => loadWallet()}
    />
  );
}
