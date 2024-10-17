import {
  ArchiveBoxIcon,
  ArrowsPointingOutIcon,
  ArrowsRightLeftIcon,
  DocumentCheckIcon,
  GiftIcon,
  LockClosedIcon,
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
  desc: "Vesting contract is a smart contract that locks up funds for a period of time and allows the owner to withdraw the funds after the lockup period.",
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
  icon: ArchiveBoxIcon,
};
export const metaMintPlutusNft = {
  title: "Mint Plutus NFT",
  desc: "Mint NFT that ensure the token name is incremented by a counter",
  link: "/smart-contracts/plutus-nft",
  icon: ArchiveBoxIcon,
};

export const linksSmartContracts: MenuItem[] = [
  metaContentOwnership,
  metaEscrow,
  metaGiftcard,
  metaMarketplace,
  metaMintPlutusNft,
  metaPaymentSplitter,
  metaSwap,
  metaVesting,
];

export const metaSmartContract: MenuItem = {
  title: "Smart Contracts",
  desc: "Want to get started with smart contracts? Here are some contracts for the most common use-cases.",
  link: "/smart-contracts",
  icon: DocumentCheckIcon,
  items: linksSmartContracts,
};
