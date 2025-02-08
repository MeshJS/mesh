import { MenuItem } from "~/types/menu-item";

export const metaPolkadotGettingStarted = {
  title: "Getting Started",
  desc: "Setting up your system to work with Polkadot",
  link: "/polkadot/getting-started",
};

export const linksPolkadot: MenuItem[] = [metaPolkadotGettingStarted];

export const metaPolkadot: MenuItem = {
  title: "Polkadot",
  desc: "Polkadot is a multi-chain blockchain platform that enables cross-chain interoperability",
  link: "/polkadot",
  items: linksPolkadot,
};

