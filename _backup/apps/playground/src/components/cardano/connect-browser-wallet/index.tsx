import { CardanoWallet } from "@meshsdk/react";

import { useDarkmode } from "~/hooks/useDarkmode";
import { getProvider } from "../mesh-wallet";
import { checkIfMetamaskInstalled } from "./metamask";

export default function ConnectBrowserWallet() {
  return (
    <>
      <CommonCardanoWallet />
    </>
  );
}

export function CommonCardanoWallet() {
  const provider = getProvider();
  const isDark = useDarkmode((state) => state.isDark);
  return (
    <CardanoWallet
      label={"Connect a Wallet"}
      burnerWallet={{
        networkId: 0,
        provider: provider,
      }}
      injectFn={async () => await checkIfMetamaskInstalled("preprod")}
      isDark={isDark}
      persist={true}
      web3Services={{
        networkId: 0,
        fetcher: provider,
        submitter: provider,
        projectId: "31c8857a-43a7-4b85-b8be-5486e53caab3",
      }}
    />
  );
}
