import { Extension } from "@meshsdk/common";
import { InitWeb3WalletOptions } from "@meshsdk/web3-sdk";

import IconBookDashed from "../common/icons/icon-book-dashed";
import IconDownload from "../common/icons/icon-download";
import IconFingerprint from "../common/icons/icon-fingerprint";
import IconMonitorSmartphone from "../common/icons/icon-monitor-smartphone";
import { TooltipProvider } from "../common/tooltip";
import { useWallet, useWalletList } from "../hooks";
import { screens } from "./data";
import WalletIcon from "./wallet-icon";
import Web3Services from "./web3-services";

export default function ScreenMain({
  injectFn,
  setOpen,
  setScreen,
  persist,
  cardanoPeerConnect,
  burnerWallet,
  webauthn,
  showDownload,
  web3Services,
}: {
  injectFn?: () => Promise<void>;
  setOpen: Function;
  setScreen: Function;
  persist: boolean;
  cardanoPeerConnect: boolean;
  burnerWallet: boolean;
  webauthn: boolean;
  showDownload: boolean;
  web3Services?: InitWeb3WalletOptions;
}) {
  const wallets = useWalletList({ injectFn });
  const { connect } = useWallet();

  return (
    <TooltipProvider>
      <div className="mesh-grid mesh-gap-4 mesh-py-4 mesh-grid-cols-5 mesh-place-items-center mesh-gap-y-8">
        {wallets.map((wallet, index) => (
          <WalletIcon
            key={index}
            icon={wallet.icon}
            name={wallet.name}
            action={() => {
              connect(wallet.id, persist);
              setOpen(false);
            }}
          />
        ))}

        {web3Services && (
          <Web3Services options={web3Services} setOpen={setOpen} />
        )}

        {webauthn && (
          <WalletIcon
            iconReactNode={IconFingerprint()}
            name={screens.webauthn.title}
            action={() => {
              setScreen("webauthn");
            }}
          />
        )}
        {cardanoPeerConnect && (
          <WalletIcon
            iconReactNode={IconMonitorSmartphone()}
            name={screens.p2p.title}
            action={() => {
              setScreen("p2p");
            }}
          />
        )}
        {burnerWallet && (
          <WalletIcon
            iconReactNode={IconBookDashed()}
            name={screens.burner.title}
            action={() => {
              setScreen("burner");
            }}
          />
        )}

        {showDownload && (
          <WalletIcon
            iconReactNode={IconDownload()}
            name={`Download`}
            action={() => {
              window.open(
                "https://developers.cardano.org/showcase/?tags=wallet",
                "_blank",
              );
            }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
