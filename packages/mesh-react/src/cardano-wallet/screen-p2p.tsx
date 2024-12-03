import { useEffect, useRef, useState } from "react";
// import { DAppPeerConnect, IWalletInfo } from "../common/cardano-peer-connect";

import { DAppPeerConnect } from "@fabianbormann/cardano-peer-connect";
import { IWalletInfo } from "@fabianbormann/cardano-peer-connect/dist/src/types";

import { Button } from "../common/button";

export default function ScreenP2P({
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

        if (dAppConnect.current) {
          const address = dAppConnect.current.getAddress();
          setAddress(address);
          console.log("address", address);

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
