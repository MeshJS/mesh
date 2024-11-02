import {
  ArrowsPointingOutIcon,
  ArrowsRightLeftIcon,
  DocumentCheckIcon,
  GiftIcon,
  LockClosedIcon,
  PhotoIcon,
  PlayIcon,
  ShoppingCartIcon,
} from "@heroicons/react/24/solid";

import { MenuItem } from "~/types/menu-item";

export const metaMarketplace = {
  title: "Marketplace",
  desc: "Build a NFT marketplace to buy and sell NFTs",
  link: "/smart-contracts/marketplace",
  icon: ShoppingCartIcon,
};
export const metaVesting = {
  title: "Vesting",
  desc: "Locks up funds and allows the beneficiary to withdraw the funds after the lockup period",
  link: "/smart-contracts/vesting",
  icon: LockClosedIcon,
};
export const metaEscrow = {
  title: "Escrow",
  desc: "Secure exchange of assets between two parties",
  link: "/smart-contracts/escrow",
  icon: ArrowsRightLeftIcon,
};
export const metaGiftcard = {
  title: "Giftcard",
  desc: "Create a giftcard with native tokens",
  link: "/smart-contracts/giftcard",
  icon: GiftIcon,
};
export const metaSwap = {
  title: "Swap",
  desc: "Swap contract facilitates the exchange of assets between two parties",
  link: "/smart-contracts/swap",
  icon: ArrowsRightLeftIcon,
};
export const metaPaymentSplitter = {
  title: "Payment Splitter",
  desc: "Split payouts equally among a list of specified payees",
  link: "/smart-contracts/payment-splitter",
  icon: ArrowsPointingOutIcon,
};
export const metaContentOwnership = {
  title: "Content Ownership",
  desc: "Manage ownership of digital content and assets",
  link: "/smart-contracts/content-ownership",
  icon: DocumentCheckIcon,
};
export const metaMintPlutusNft = {
  title: "NFT Minting Vending Machine",
  desc: "Mint NFT that ensure the token name is incremented by a counter",
  link: "/smart-contracts/plutus-nft",
  icon: PhotoIcon,
};
export const metaHelloWorld = {
  title: "Hello World",
  desc: "Simple lock and unlock assets contract",
  link: "/smart-contracts/hello-world",
  icon: PlayIcon,
};

export const linksSmartContracts: MenuItem[] = [
  metaContentOwnership,
  metaEscrow,
  metaGiftcard,
  metaHelloWorld,
  metaMarketplace,
  metaMintPlutusNft,
  metaPaymentSplitter,
  metaSwap,
  metaVesting,
];

export const metaSmartContract: MenuItem = {
  title: "Smart Contracts",
  desc: "Here's a list of open-source smart contracts, complete with documentation, live demos, and end-to-end source code.",
  link: "/smart-contracts",
  icon: DocumentCheckIcon,
  items: linksSmartContracts,
};
