/**
 * todo:
 * - handle show when no wallet in device
 */
import { useEffect, useRef, useState } from "react";
import { DAppPeerConnect } from "@fabianbormann/cardano-peer-connect";
import { IWalletInfo } from "@fabianbormann/cardano-peer-connect/dist/src/types";

import { Button } from "../common/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../common/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../common/dropdown-menu";
import IconChevronRight from "../common/icons/icon-chevron-right";
import IconDownload from "../common/icons/icon-download";
import IconMonitorSmartphone from "../common/icons/icon-monitor-smartphone";
import WalletIcon from "../common/icons/wallet-icon";
import { useWallet, useWalletList } from "../hooks";

interface ButtonProps {
  label?: string;
  onConnected?: Function;
  isDark?: boolean;
  metamask?: {
    network: string;
  };
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
  metamask = undefined,
  extensions = [],
  cardanoPeerConnect = undefined,
}: ButtonProps) => {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState("main");

  const { wallet, connected } = useWallet();

  useEffect(() => {
    if (connected && wallet) {
      if (onConnected) onConnected();
    }
  }, [connected, wallet]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!connected ? (
        <DialogTrigger asChild>
          <Button variant="outline" className="mesh-text-white">
            {label}
          </Button>
        </DialogTrigger>
      ) : (
        <ConnectedDropdown />
      )}

      <DialogContent className="sm:mesh-max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="mesh-flex mesh-justify-between">
            {screen != "main" ? (
              <button onClick={() => setScreen("main")}>
                <IconChevronRight />
              </button>
            ) : (
              <span style={{ width: "24px" }}></span>
            )}
            <span>
              {screen == "main" && "Connect Wallet"}
              {screen == "p2p" && "P2P Connect"}
            </span>
            <span style={{ width: "24px" }}></span>
          </DialogTitle>
          <DialogDescription>
            {screen == "p2p" &&
              "Use wallet that supports CIP-45, scan this QR code to connect."}
          </DialogDescription>
        </DialogHeader>

        {screen == "main" && (
          <MainScreen
            metamask={metamask}
            extensions={extensions}
            setOpen={setOpen}
            setScreen={setScreen}
          />
        )}
        {screen == "p2p" && (
          <P2PScreen cardanoPeerConnect={cardanoPeerConnect} />
        )}

        <DialogFooter className="mesh-justify-center mesh-text-sm">
          <a
            href="https://meshjs.dev/"
            target="_blank"
            className="mesh-grow mesh-flex mesh-gap-1 mesh-items-center mesh-justify-center mesh-text-zinc-500 hover:mesh-text-white mesh-fill-zinc-500 hover:mesh-fill-white"
          >
            <span className="">Powered by</span>
            <svg
              width={24}
              height={24}
              enableBackground="new 0 0 300 200"
              viewBox="0 0 300 200"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="m289 127-45-60-45-60c-.9-1.3-2.4-2-4-2s-3.1.7-4 2l-37 49.3c-2 2.7-6 2.7-8 0l-37-49.3c-.9-1.3-2.4-2-4-2s-3.1.7-4 2l-45 60-45 60c-1.3 1.8-1.3 4.2 0 6l45 60c.9 1.3 2.4 2 4 2s3.1-.7 4-2l37-49.3c2-2.7 6-2.7 8 0l37 49.3c.9 1.3 2.4 2 4 2s3.1-.7 4-2l37-49.3c2-2.7 6-2.7 8 0l37 49.3c.9 1.3 2.4 2 4 2s3.1-.7 4-2l45-60c1.3-1.8 1.3-4.2 0-6zm-90-103.3 32.5 43.3c1.3 1.8 1.3 4.2 0 6l-32.5 43.3c-2 2.7-6 2.7-8 0l-32.5-43.3c-1.3-1.8-1.3-4.2 0-6l32.5-43.3c2-2.7 6-2.7 8 0zm-90 0 32.5 43.3c1.3 1.8 1.3 4.2 0 6l-32.5 43.3c-2 2.7-6 2.7-8 0l-32.5-43.3c-1.3-1.8-1.3-4.2 0-6l32.5-43.3c2-2.7 6-2.7 8 0zm-53 152.6-32.5-43.3c-1.3-1.8-1.3-4.2 0-6l32.5-43.3c2-2.7 6-2.7 8 0l32.5 43.3c1.3 1.8 1.3 4.2 0 6l-32.5 43.3c-2 2.7-6 2.7-8 0zm90 0-32.5-43.3c-1.3-1.8-1.3-4.2 0-6l32.5-43.3c2-2.7 6-2.7 8 0l32.5 43.3c1.3 1.8 1.3 4.2 0 6l-32.5 43.3c-2 2.7-6 2.7-8 0zm90 0-32.5-43.3c-1.3-1.8-1.3-4.2 0-6l32.5-43.3c2-2.7 6-2.7 8 0l32.5 43.3c1.3 1.8 1.3 4.2 0 6l-32.5 43.3c-2 2.7-6 2.7-8 0z" />
            </svg>
            <span className="">Mesh SDK</span>
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

function ConnectedDropdown() {
  const { wallet, connected, disconnect } = useWallet();
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (connected && wallet) {
      async function afterConnectedWallet() {
        let address = (await wallet.getUnusedAddresses())[0];
        if (!address) address = await wallet.getChangeAddress();
        setAddress(address);
      }
      afterConnectedWallet();
    }
  }, [connected, wallet]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="outline" className="mesh-text-white">
          {address.slice(0, 6)}...{address.slice(-6)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Wallet</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            navigator.clipboard.writeText(address);
          }}
        >
          Copy Address
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            disconnect();
          }}
        >
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MainScreen({
  metamask,
  extensions,
  setOpen,
  setScreen,
}: {
  metamask?: {
    network: string;
  };
  extensions: number[];
  setOpen: Function;
  setScreen: Function;
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
      <WalletIcon
        iconReactNode={IconMonitorSmartphone()}
        name={`P2P`}
        action={() => {
          setScreen("p2p");
        }}
      />
      <WalletIcon
        iconReactNode={IconDownload()}
        name={`P2P`}
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

function P2PScreen({
  cardanoPeerConnect,
}: {
  cardanoPeerConnect?: {
    dAppInfo: {
      name: string;
      url: string;
    };
    announce: string[];
  };
}) {
  const dAppConnect = useRef<DAppPeerConnect | null>(null);
  const qrCodeField = useRef<HTMLDivElement | null>(null);
  const [address, setAddress] = useState("");
  const [copied, setCopied] = useState(false);
  const [connected, setConnected] = useState(false);
  console.log("address", address);

  useEffect(() => {
    if (cardanoPeerConnect) {
      if (dAppConnect.current === null) {
        dAppConnect.current = new DAppPeerConnect({
          dAppInfo: {
            name: cardanoPeerConnect.dAppInfo.name,
            url: cardanoPeerConnect.dAppInfo.url,
          },
          announce: cardanoPeerConnect.announce,
          onApiInject: (name: string, address: string) => {
            console.log("onApiInject", name, address);
          },
          onApiEject: (name: string, address: string) => {
            console.log("onApiEject", name, address);
          },
          onConnect: (address: string, walletInfo?: IWalletInfo) => {
            console.log("Connected to wallet", address, walletInfo);
          },
          onDisconnect: () => {
            console.log("Disconnected from wallet");
          },
          verifyConnection: (
            walletInfo: IWalletInfo,
            callback: (granted: boolean, autoconnect: boolean) => void,
          ) => {
            console.log("verifyConnection", walletInfo);
            callback(true, true);
          },
          useWalletDiscovery: true,
        });
        console.log(1, dAppConnect.current);
        if (dAppConnect.current) {
          setAddress(dAppConnect.current.getAddress());

          if (qrCodeField.current !== null) {
            dAppConnect.current.generateQRCode(qrCodeField.current);
          }
        }
      }
    }
  }, []);

  return (
    <div className="mesh-flex mesh-flex-col mesh-items-center mesh-justify-center">
      <div style={{ marginTop: 16, marginBottom: 16 }} ref={qrCodeField}></div>
      <Button
        variant="outline"
        className="mesh-text-white"
        onClick={() => {
          navigator.clipboard.writeText(address);
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy Address"}
      </Button>
    </div>
  );
}
