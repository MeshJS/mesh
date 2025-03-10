import { CardanoWallet, useWalletList } from "@meshsdk/react";

import { useDarkmode } from "~/hooks/useDarkmode";
import { getProvider } from "../mesh-wallet";
import { checkIfMetamaskInstalled } from "./metamask";

export default function ConnectBrowserWallet() {
  const wallets = useWalletList();
  const hasAvailableWallets = wallets.length > 0;

  return (
    <>
      {hasAvailableWallets ? (
        <CommonCardanoWallet />
      ) : (
        <>No wallets installed</>
      )}
    </>
  );
}

export function CommonCardanoWallet() {
  const provider = getProvider();
  const isDark = useDarkmode((state) => state.isDark);
  return (
    <CardanoWallet
      label={"Connect a Wallet"}
      extensions={[95]}
      cardanoPeerConnect={{
        dAppInfo: {
          name: "Mesh SDK",
          url: "https://meshjs.dev/",
        },
        announce: [
          "wss://dev.btt.cf-identity-wallet.metadata.dev.cf-deployments.org",
          "wss://dev.tracker.cf-identity-wallet.metadata.dev.cf-deployments.org",
          "wss://tracker.de-0.eternl.art",
          "wss://tracker.de-5.eternl.art",
          "wss://tracker.de-6.eternl.art",
          "wss://tracker.us-5.eternl.art",
        ],
      }}
      burnerWallet={{
        networkId: 0,
        provider: provider,
      }}
      // webauthn={{
      //   networkId: 0,
      //   provider: provider,
      //   url: "http://localhost:8080",
      // }}
      injectFn={async () => await checkIfMetamaskInstalled("preprod")}
      isDark={isDark}
      persist={true}
      // web3Services={{
      //   networkId: 0,
      //   fetcher: provider,
      //   submitter: provider,
      // }}
    />
  );
}
