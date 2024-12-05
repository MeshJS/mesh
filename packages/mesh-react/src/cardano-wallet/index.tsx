import { useEffect, useState } from "react";

import { IFetcher, ISubmitter } from "@meshsdk/common";

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
import IconChevronRight from "../common/icons/icon-chevron-right";
import { useWallet } from "../hooks";
import ConnectedButton from "./connected-button";
import { screens } from "./data";
import ScreenBurner from "./screen-burner";
import ScreenMain from "./screen-main";
import ScreenP2P from "./screen-p2p";

interface ButtonProps {
  label?: string;
  onConnected?: Function;
  isDark?: boolean;
  extensions?: number[];
  metamask?: {
    network: string;
  };
  cardanoPeerConnect?: {
    dAppInfo: {
      name: string;
      url: string;
    };
    announce: string[];
  };
  burnerWallet?: {
    networkId: 0 | 1;
    provider: IFetcher & ISubmitter;
  };
}

export const CardanoWallet = ({
  label = "Connect Wallet",
  onConnected = undefined,
  isDark = false,
  extensions = [],
  metamask = undefined,
  cardanoPeerConnect = undefined,
  burnerWallet = undefined,
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
        <ConnectedButton />
      )}

      <DialogContent
        className="sm:mesh-max-w-[425px]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Header screen={screen} setScreen={setScreen} />

        {screen == "main" && (
          <ScreenMain
            metamask={metamask}
            extensions={extensions}
            setOpen={setOpen}
            setScreen={setScreen}
            cardanoPeerConnect={cardanoPeerConnect != undefined}
            burnerWallet={burnerWallet != undefined}
          />
        )}
        {screen == "p2p" && (
          <ScreenP2P
            cardanoPeerConnect={cardanoPeerConnect}
            setOpen={setOpen}
          />
        )}
        {screen == "burner" && burnerWallet && (
          <ScreenBurner
            networkId={burnerWallet.networkId}
            provider={burnerWallet.provider}
            setOpen={setOpen}
          />
        )}

        <Footer />
      </DialogContent>
    </Dialog>
  );
};

function Header({
  screen,
  setScreen,
}: {
  screen: string;
  setScreen: Function;
}) {
  return (
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
          {/* @ts-ignore */}
          {screens[screen].title}
        </span>
        <span style={{ width: "24px" }}></span>
      </DialogTitle>
      <DialogDescription>
        {/* @ts-ignore */}
        {screens[screen].subtitle && screens[screen].subtitle}
      </DialogDescription>
    </DialogHeader>
  );
}

function Footer() {
  return (
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
  );
}
