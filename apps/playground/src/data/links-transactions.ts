import {
  ArrowsPointingInIcon,
  BanknotesIcon,
  FireIcon,
  NewspaperIcon,
  PaperAirplaneIcon,
  ScaleIcon,
} from "@heroicons/react/24/solid";

export const metaTransactionBasic = {
  link: `/apis/transaction/basics`,
  title: "Transaction Basics",
  desc: "Working with transactions and its various options",
  icon: PaperAirplaneIcon,
};
export const metaMinting = {
  link: `/apis/transaction/minting`,
  title: "Mint and Burn Assets",
  desc: "Minting and burning assets with Native Script and Plutus Script",
  icon: FireIcon,
};
export const metaTransactionSmartContract = {
  link: `/apis/transaction/smart-contract`,
  title: "Smart Contracts",
  desc: "Transactions to work with smart contracts",
  icon: NewspaperIcon,
};
export const metaStaking = {
  link: `/apis/transaction/staking`,
  title: "Staking Transactions",
  desc: "Transactions for delegating ADA and managing stakepools",
  icon: ArrowsPointingInIcon,
};
export const linksTransactions = [
  metaTransactionBasic,
  metaMinting,
  metaTransactionSmartContract,
  metaStaking,
];

export const metaTransaction = {
  title: "Transactions",
  desc: "For sending and minting assets and working with smart contracts",
  link: "/apis/transaction",
  icon: BanknotesIcon,
  items: linksTransactions,
};
