import { MenuItem } from "~/types/menu-item";

export const metaAikenGettingStarted = {
  title: "Getting Started",
  desc: "Setting up your system to compile Aiken smart contracts",
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
export const metaAikenCourse = {
  title: "Smart Contract course by STOIC",
  desc: "Learn the concepts of Aiken while enjoying live coding examples",
  link: "https://www.youtube.com/playlist?list=PLCuyQuWCJVQ1Zz9ySRMH_J6EymxhnZ0Hu",
};

export const linksAiken: MenuItem[] = [
  metaAikenGettingStarted,
  metaAikenFirstScript,
  metaAikenTransactions,
  metaAikenContractsLib,
  metaAikenCourse,
];

export const metaAiken: MenuItem = {
  title: "Aiken",
  desc: "Functional programming language created for Cardano smart contract development",
  link: "/aiken",
  items: linksAiken,
  icon: "/images/aiken/aiken-icon.png",
};
