import { Wallet } from "@meshsdk/common";
import { useLovelace } from "../hooks";

import { ChevronDown } from "./chevron-down";

export const WalletBalance = ({
  connected,
  connecting,
  label,
  wallet,
}: {
  connected: boolean;
  connecting: boolean;
  label: string;
  wallet: Wallet | undefined;
}) => {
  const lovelace = useLovelace();

  return connected && lovelace && wallet?.icon ? (
    <>
      <img className="mesh-m-2 mesh-h-6" src={wallet.icon} />₳{" "}
      {parseInt((parseInt(lovelace, 10) / 1_000_000).toString(), 10)}.
      <span className="mesh-text-xs">{lovelace.substring(lovelace.length - 6)}</span>
    </>
  ) : connected && wallet?.icon ? (
    <>
      <img className="mesh-m-2 mesh-h-6" src={wallet.icon} />
    </>
  ) : connecting ? (
    <>Connecting...</>
  ) : (
    <>
      {label} <ChevronDown />
    </>
  );
};
