import IconBookDashed from "../common/icons/icon-book-dashed";
import IconDownload from "../common/icons/icon-download";
import IconMonitorSmartphone from "../common/icons/icon-monitor-smartphone";
import { TooltipProvider } from "../common/tooltip";
import { useWallet, useWalletList } from "../hooks";
import { screens } from "./data";
import WalletIcon from "./wallet-icon";

export default function ScreenMain({
  metamask,
  extensions,
  setOpen,
  setScreen,
  cardanoPeerConnect,
  burnerWallet,
}: {
  metamask?: {
    network: string;
  };
  extensions: number[];
  setOpen: Function;
  setScreen: Function;
  cardanoPeerConnect: boolean;
  burnerWallet: boolean;
}) {
  const wallets = useWalletList({ metamask });
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
              connect(wallet.id, extensions);
              setOpen(false);
            }}
          />
        ))}

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
      </div>
    </TooltipProvider>
  );
}
