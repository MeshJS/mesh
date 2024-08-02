import { DocumentTextIcon } from "@heroicons/react/24/solid";

import { MenuItem } from "~/types/menu-item";

export const linksGuides: MenuItem[] = [
  {
    title: "Develop your first Web3 App",
    desc: "A step-by-step guide to setup a Next.js web application, add a wallet connection and browse assets.",
    link: "/guides/nextjs",
    thumbnail: "/guides/develop-first-web-app.png",
  },
  {
    title: "Minting Application",
    desc: "Load CLI generated keys and mint assets on Node.js.",
    link: "/guides/minting-on-nodejs",
    thumbnail: "/guides/minting-application.png",
  },
  {
    title: "Multi-Signatures Transaction",
    desc: "Learn about multi-sig transaction, build a minting transaction involving AppWallet and BrowserWallet.",
    link: "/guides/multisig-minting",
    thumbnail: "/guides/multi-signatures-transaction.png",
  },
  {
    title: "Integrating Smart Contract",
    desc: "A step-by-step guide to integrate your Cardano Smart Contract to a web application.",
    link: "/guides/smart-contract",
    thumbnail: "/guides/integrating-smart-contract.png",
  },
  {
    title: "Prove Wallet Ownership",
    desc: "Cryptographically prove the ownership of a wallet by signing a piece of data using data sign.",
    link: "/guides/prove-wallet-ownership",
    thumbnail: "/guides/cryptographically-prove-wallet-ownership.png",
  },
  {
    title: "Implement Custom Provider",
    desc: "Build custom Providers that provides an API to access and process information provided by services.",
    link: "/guides/custom-provider",
    thumbnail: "/guides/implement-custom-provider.png",
  },
  {
    title: "Smart Contract Transactions",
    desc: "Build a marketplace with Plutus (Haskell), where users can list their assets for sale and purchase the listed assets.",
    link: "/guides/smart-contract-transactions",
    thumbnail: "/guides/smart-contract-transactions.png",
  },
  {
    title: "Aiken Hello World",
    desc: "Create smart contracts with Aiken and execute transactions with Mesh.",
    link: "/guides/aiken",
    thumbnail: "/guides/aiken.png",
  },
  {
    title: "Executing a standalone script",
    desc: "Learn how to execute a standalone script to manage wallets and creating transactions.",
    link: "/guides/standalone",
    thumbnail: "/guides/standalone.png",
  },
];

export const metaGuides: MenuItem = {
  link: `/guides`,
  title: "Guides",
  desc: "Whether you are new to web development or a seasoned blockchain full-stack developer, these guides will help you get started.",
  icon: DocumentTextIcon,
  items: linksGuides,
};
