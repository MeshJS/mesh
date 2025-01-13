import { useEffect, useState } from "react";

import ButtonDropdown from "../common/button-dropdown";
import { useWallet, useWalletList } from "../hooks";
import { MenuItem } from "./menu-item";
import { WalletBalance } from "./wallet-balance";

interface ButtonProps {
  label?: string;
  onConnected?: Function;
  isDark?: boolean;
  extensions?: number[];
  cardanoPeerConnect?: {
    dAppInfo: {
      name: string;
      url: string;
    };
    announce: string[];
  };
}

export const CardanoWallet = ({
  label = "Connect Wallet",
  onConnected = undefined,
  isDark = false,
  extensions = [],
  cardanoPeerConnect = undefined,
}: ButtonProps) => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [hideMenuList, setHideMenuList] = useState(true);

  const { connect, connecting, connected, disconnect, name } = useWallet();
  const wallets = useWalletList();

  useEffect(() => {
    if (connected && onConnected) {
      onConnected();
    }
  }, [connected]);

  useEffect(() => {
    setIsDarkMode(isDark);
  }, [isDark]);

  // useEffect(() => {
  //   if (
  //     typeof window !== "undefined" &&
  //     typeof navigator !== "undefined" &&
  //     cardanoPeerConnect
  //   ) {
  //     import("@fabianbormann/cardano-peer-connect").then((module) => {
  //       const dAppPeerConnect = new module.DAppPeerConnect({
  //         dAppInfo: {
  //           name: cardanoPeerConnect.dAppInfo.name,
  //           url: cardanoPeerConnect.dAppInfo.url,
  //         },
  //         announce: cardanoPeerConnect.announce,
  //         onApiInject: (name: string, address: string) => {},
  //         onApiEject: (name: string, address: string) => {},
  //         onConnect: (address: string, walletInfo?: IWalletInfo) => {
  //           console.log("Connected to wallet", address, walletInfo);
  //         },
  //         onDisconnect: () => {
  //           console.log("Disconnected from wallet");
  //         },
  //         verifyConnection: (
  //           walletInfo: IWalletInfo,
  //           callback: (granted: boolean, autoconnect: boolean) => void,
  //         ) => {
  //           console.log("verifyConnection", walletInfo);
  //           callback(true, true);
  //         },
  //         useWalletDiscovery: true,
  //       });

  //       console.log(dAppPeerConnect);
  //       console.log(dAppPeerConnect.getAddress());
  //     });
  //   }
  // }, []);

  return (
    <div
      onMouseEnter={() => setHideMenuList(false)}
      onMouseLeave={() => setHideMenuList(true)}
      style={{ width: "min-content", zIndex: 50 }}
    >
      <ButtonDropdown
        isDarkMode={isDarkMode}
        hideMenuList={hideMenuList}
        setHideMenuList={setHideMenuList}
      >
        <WalletBalance
          connected={connected}
          connecting={connecting}
          label={label}
          wallet={wallets.find((wallet) => wallet.id === name)}
        />
      </ButtonDropdown>
      <div
        className={`mesh-mr-menu-list mesh-absolute mesh-w-60 mesh-rounded-b-md mesh-border mesh-text-center mesh-shadow-sm mesh-backdrop-blur ${hideMenuList && "mesh-hidden"} ${isDarkMode ? `mesh-bg-neutral-950	mesh-text-neutral-50` : `mesh-bg-neutral-50	mesh-text-neutral-950`}`}
        style={{ zIndex: 50 }}
      >
        {!connected && wallets.length > 0 ? (
          <>
            {wallets.map((wallet, index) => (
              <MenuItem
                key={index}
                icon={wallet.icon}
                label={wallet.name}
                action={() => {
                  connect(wallet.id, extensions);
                  setHideMenuList(!hideMenuList);
                }}
                active={name === wallet.id}
              />
            ))}

            {/* <MenuItem
              icon={
                isDarkMode
                  ? `https://meshjs.dev/logo-mesh/white/logo-mesh-white-128x128.png`
                  : `https://meshjs.dev/logo-mesh/black/logo-mesh-black-128x128.png`
              }
              label={'Local'}
              action={() => {
                connectLocalWallet();
                setHideMenuList(!hideMenuList);
              }}
              active={false}
            /> */}
          </>
        ) : wallets.length === 0 ? (
          <span>No Wallet Found</span>
        ) : (
          <>
            <MenuItem
              active={false}
              label="disconnect"
              action={disconnect}
              icon={undefined}
            />
          </>
        )}
      </div>
    </div>
  );
};
