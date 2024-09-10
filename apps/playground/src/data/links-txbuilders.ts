import {
  ArrowsPointingInIcon,
  BanknotesIcon,
  FireIcon,
  NewspaperIcon,
  PaperAirplaneIcon,
  ScaleIcon,
} from "@heroicons/react/24/solid";

export const metaTxbuilderBasic = {
  link: `/apis/txbuilder/basics`,
  title: "Transaction Basics",
  desc: "Working with transactions and its various options",
  icon: PaperAirplaneIcon,
};
export const metaTxbuilderMinting = {
  link: `/apis/txbuilder/minting`,
  title: "Mint and Burn Assets",
  desc: "Minting and burning assets with Native Script and Plutus Script",
  icon: FireIcon,
};
export const metaTxbuilderSmartContract = {
  link: `/apis/txbuilder/smart-contract`,
  title: "Smart Contracts",
  desc: "Transactions to work with smart contracts",
  icon: NewspaperIcon,
};
export const metaTxbuilderStaking = {
  link: `/apis/txbuilder/staking`,
  title: "Staking Transactions",
  desc: "Transactions for delegating ADA and managing stakepools",
  icon: ArrowsPointingInIcon,
};
export const metaTxbuilderGovernance = {
  link: `/apis/txbuilder/governance`,
  title: "Governance Transactions",
  desc: "Transactions for participating in Cardano's on-chain governance",
  icon: ScaleIcon,
};

export const linksTxbuilder = [
  metaTxbuilderBasic,
  metaTxbuilderMinting,
  metaTxbuilderSmartContract,
  metaTxbuilderStaking,
  metaTxbuilderGovernance,
];

export const metaTxbuilder = {
  title: "Transaction Builder",
  desc: "Build all possible transaction with our cardano-cli like APIs",
  link: "/apis/txbuilder",
  icon: BanknotesIcon,
  items: linksTxbuilder,
};
