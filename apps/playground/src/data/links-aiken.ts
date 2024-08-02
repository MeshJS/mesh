import { MenuItem } from "~/types/menu-item";

export const metaAikenGettingStarted = {
  title: "Getting Started",
  desc: "We will walk you through the process of setting up your system to compile Aiken smart contracts",
  link: "/aiken/getting-started",
};
export const metaAikenFirstScript = {
  title: "Write a Smart Contract",
  desc: "Learn how to write your first Aiken script, with a simple redeemer",
  link: "/aiken/first-script",
};
export const metaAikenTransactions = {
  title: "Build Transactions",
  desc: "Build transactions to interact with smart contracts",
  link: "/aiken/transactions",
};
export const metaAikenContractsLib = {
  title: "Smart Contracts Library",
  desc: "A library of smart contracts to help you start building and learning",
  link: "/smart-contracts",
};

export const linksAiken: MenuItem[] = [
  metaAikenGettingStarted,
  metaAikenFirstScript,
  metaAikenTransactions,
  metaAikenContractsLib,
];

export const metaAiken: MenuItem = {
  title: "Aiken",
  desc: "A functional programming language created for Cardano smart contract development",
  link: "/aiken",
  items: linksAiken,
};
