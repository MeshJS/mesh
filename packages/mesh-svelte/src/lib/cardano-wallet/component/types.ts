export type ConnectWalletButtonProps = {
  label?: string;
  onConnected?: Function;
  isDark?: boolean;
  metamask?: {
    network: string;
  };
  extensions?: number[];
};
