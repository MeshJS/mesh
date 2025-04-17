import { useState } from "react";

import {
  EnableWeb3WalletOptions,
  UserControlledWalletDirectTo,
  Web3Wallet,
} from "@meshsdk/web3-sdk";

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
  options: EnableWeb3WalletOptions;
  setOpen: Function;
  persist: boolean;
}) {
  const { setWallet, setWeb3UserData } = useWallet();
  const [loading, setLoading] = useState(false);

  async function loadWallet(directTo: UserControlledWalletDirectTo) {
    setLoading(true);
    const _options: EnableWeb3WalletOptions = {
      networkId: 0,
      fetcher: options.fetcher,
      submitter: options.submitter,
      appUrl: options.appUrl,
      projectId: options.projectId,
      directTo: directTo,
    };
    const wallet = await Web3Wallet.enable(_options);
    const user = wallet.getUser();

    setWeb3UserData(user);
    setWallet(
      wallet,
      "Mesh Web3 Services",
      persist
        ? {
            walletAddress: await wallet.getChangeAddress(),
            user: user,
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
        action={() => loadWallet("google")}
        loading={loading}
      />
      <WalletIcon
        iconReactNode={IconDiscord()}
        name={`Discord`}
        action={() => loadWallet("discord")}
        loading={loading}
      />
      <WalletIcon
        iconReactNode={IconTwitter()}
        name={`Twitter`}
        action={() => loadWallet("twitter")}
        loading={loading}
      />
    </>
  );
}
