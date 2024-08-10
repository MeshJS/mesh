import {
  BanknotesIcon,
  CodeBracketSquareIcon,
  WalletIcon,
} from "@heroicons/react/24/solid";

export const metaAppwallet = {
  link: `/apis/wallets/appwallet`,
  title: "App Wallet",
  desc: "Core wallet functionality for building other user wallets and fully customed applications's backend.",
  icon: CodeBracketSquareIcon,
};
export const metaBrowserwallet = {
  link: `/apis/wallets/browserwallet`,
  title: "Browser Wallet",
  desc: "For connecting, queries and performs wallet functions in accordance to CIP-30.",
  icon: BanknotesIcon,
};
export const metaMeshwallet = {
  link: `/apis/wallets/meshwallet`,
  title: "Mesh Wallet",
  desc: "Mesh Wallet provides a set of APIs to interact with the blockchain. This wallet is compatible with Mesh transaction builders.",
  icon: WalletIcon,
};

export const linksWallets = [metaBrowserwallet, metaMeshwallet];

export const metaWallets = {
  title: "Wallets",
  desc: "Wallet for building amazing applications",
  link: "/apis/wallets",
  icon: WalletIcon,
  items: linksWallets,
};
