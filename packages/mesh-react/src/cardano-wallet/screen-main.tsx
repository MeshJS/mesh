import IconDownload from "../common/icons/icon-download";
import IconMonitorSmartphone from "../common/icons/icon-monitor-smartphone";
import WalletIcon from "../common/icons/wallet-icon";
import { useWallet, useWalletList } from "../hooks";

export default function ScreenMain({
  metamask,
  extensions,
  setOpen,
  setScreen,
  cardanoPeerConnect,
}: {
  metamask?: {
    network: string;
  };
  extensions: number[];
  setOpen: Function;
  setScreen: Function;
  cardanoPeerConnect?: {
    dAppInfo: {
      name: string;
      url: string;
    };
    announce: string[];
  };
}) {
  const wallets = useWalletList({ metamask });
  const { connect } = useWallet();

  return (
    <div className="mesh-grid mesh-gap-4 mesh-py-4 mesh-grid-cols-4 mesh-place-items-center">
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
          name={`P2P`}
          action={() => {
            setScreen("p2p");
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
  );
}
