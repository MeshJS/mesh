import { useEffect, useState } from "react";

import { IFetcher, ISubmitter } from "@meshsdk/common";
import { MeshWallet } from "@meshsdk/wallet";

import { Button } from "../common/button";
import { useWallet } from "../hooks";
import { screens } from "./data";

const localstoragekey = "mesh-burnerwallet";

export default function ScreenBurner({
  networkId,
  provider,
  setOpen,
}: {
  networkId: 0 | 1;
  provider: IFetcher & ISubmitter;
  setOpen: Function;
}) {
  const [loading, setLoading] = useState(false);
  const [hasKeyInStorage, setHasKeyInStorage] = useState(false);
  const { setWallet } = useWallet();

  function getKeyFromStorage() {
    return localStorage.getItem(localstoragekey);
  }

  useEffect(() => {
    const key = getKeyFromStorage();
    if (key) {
      setHasKeyInStorage(true);
    }
  }, []);

  function createWallet(key: string) {
    setTimeout(() => {
      const wallet = new MeshWallet({
        networkId: networkId,
        fetcher: provider,
        submitter: provider,
        key: {
          type: "root",
          bech32: key as string,
        },
      });

      if (!hasKeyInStorage) {
        localStorage.setItem(localstoragekey, key);
      }

      setWallet(wallet, screens.burner.title);
      setLoading(false);
      setOpen(false);
    }, 500);
  }

  function handleRestoreWallet() {
    setLoading(true);
    const key = getKeyFromStorage();
    createWallet(key as string);
  }

  function handleCreateWallet() {
    setLoading(true);
    const key = MeshWallet.brew(true) as string;
    createWallet(key as string);
  }

  return (
    <div className="mesh-flex mesh-flex-row mesh-flex-gap-4 mesh-items-center mesh-justify-center">
      {loading ? (
        <>Setting up wallet...</>
      ) : (
        <>
          {hasKeyInStorage && (
            <Button
              variant="outline"
              className="mesh-text-white"
              onClick={() => {
                handleRestoreWallet();
              }}
              disabled={loading}
            >
              Restore wallet
            </Button>
          )}
          <Button
            variant="outline"
            className="mesh-text-white"
            onClick={() => {
              handleCreateWallet();
            }}
            disabled={loading}
          >
            Create wallet
          </Button>
        </>
      )}
    </div>
  );
}
