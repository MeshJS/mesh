import { useState } from "react";

import { IFetcher, ISubmitter } from "@meshsdk/common";
import { connect, MeshWallet } from "@meshsdk/wallet";

import { Button } from "../common/button";
import { Input } from "../common/input";
import { Label } from "../common/label";
import { useWallet } from "../hooks";
import { screens } from "./data";

export default function ScreenWebauthn({
  url,
  networkId,
  provider,
  setOpen,
}: {
  url: string;
  networkId: 0 | 1;
  provider: IFetcher & ISubmitter;
  setOpen: Function;
}) {
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const { setWallet } = useWallet();

  function createWallet(root: string) {
    setTimeout(() => {
      const wallet = new MeshWallet({
        networkId: networkId,
        fetcher: provider,
        submitter: provider,
        key: {
          type: "root",
          bech32: root,
        },
      });
      setWallet(wallet, screens.webauthn.title);
      setLoading(false);
      setOpen(false);
    }, 500);
  }

  async function handleConnect() {
    setLoading(true);
    const res = await connect({ username: userName, password, serverUrl: url });
    if (res.success && res.wallet) {
      createWallet(res.wallet.bech32PrivateKey);
    }
  }

  return (
    <div className="mesh-flex mesh-flex-row mesh-flex-gap-4 mesh-items-center mesh-justify-center">
      {loading ? (
        <>Connecting wallet...</>
      ) : (
        <>
          <div className="mesh-flex mesh-flex-col mesh-gap-6 mesh-w-full mesh-mx-8">
            <div className="mesh-grid mesh-gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="username"
                placeholder="adalovelace"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
              />
              <p className="mesh-text-gray-500 mesh-text-xs">
                Unique to the application you are connecting.
              </p>
            </div>
            <div className="mesh-grid mesh-gap-2">
              <div className="mesh-flex mesh-items-center">
                <Label htmlFor="password">Unique Code</Label>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="mesh-text-gray-500 mesh-text-xs">
                Additional security to derive your wallet.
              </p>
            </div>
            <Button
              className="mesh-w-full"
              onClick={() => handleConnect()}
              disabled={!userName || userName.length < 6}
            >
              Connect
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
