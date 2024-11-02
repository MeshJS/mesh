import { DocumentTextIcon } from "@heroicons/react/24/solid";

import { MenuItem } from "~/types/menu-item";

export const guidenextjs = {
  title: "Develop your first Web3 App",
  desc: "A step-by-step guide to setup a Next.js web application, add a wallet connection and browse assets.",
  link: "/guides/nextjs",
  thumbnail: "/guides/develop-first-web-app.png",
  image: "/guides/laptop-g44c60b4ed_1280.jpg",
};
export const guidenodejs = {
  title: "Minting Application",
  desc: "Load CLI generated keys and mint assets on Node.js.",
  link: "/guides/minting-on-nodejs",
  thumbnail: "/guides/minting-application.png",
  image: "/guides/art-g68512aa8d_1280.jpg",
};
export const guideminting = {
  title: "Multi-Signatures Transaction",
  desc: "Learn about multi-sig transaction, build a minting transaction involving MeshWallet and BrowserWallet.",
  link: "/guides/multisig-minting",
  thumbnail: "/guides/multi-signatures-transaction.png",
  image: "/guides/keys-g25a80b203_1280.jpg",
};
export const guideownership = {
  title: "Prove Wallet Ownership",
  desc: "Cryptographically prove the ownership of a wallet by signing a piece of data using data sign.",
  link: "/guides/prove-wallet-ownership",
  thumbnail: "/guides/cryptographically-prove-wallet-ownership.png",
  image: "/guides/door-gf0710cc4d_640.jpg",
};
export const guideprovider = {
  title: "Implement Custom Provider",
  desc: "Build custom Providers that provides an API to access and process information provided by services.",
  link: "/guides/custom-provider",
  thumbnail: "/guides/implement-custom-provider.png",
  image: "/guides/service-g2192fe835_640.jpg",
};
export const guidetransactions = {
  title: "Smart Contract Transactions",
  desc: "Build a marketplace with Plutus (Haskell), where users can list their assets for sale and purchase the listed assets.",
  link: "/guides/smart-contract-transactions",
  thumbnail: "/guides/smart-contract-transactions.png",
  image: "/guides/supermarket-g42acef7c1_640.jpg",
};
export const guideaiken = {
  title: "Aiken Hello World",
  desc: "Create smart contracts with Aiken and execute transactions with Mesh.",
  link: "/guides/aiken",
  thumbnail: "/guides/aiken.png",
  image: "/guides/arches-1866598_1280.jpg",
};
export const guidestandalone = {
  title: "Executing a standalone script",
  desc: "Learn how to execute a standalone script to manage wallets and creating transactions.",
  link: "/guides/standalone",
  thumbnail: "/guides/standalone.png",
  image: "/guides/salt-harvesting-3060093_1280.jpg",
};
export const guideVesting = {
  title: "Vesting Script End-to-End",
  desc: "Learn how to vesting contract that locks up funds for a period of time and allows the beneficiary to withdraw the funds after the lockup period.",
  link: "/guides/vesting",
  thumbnail: "/guides/vesting.png",
  image: "/guides/laptop-3196481_640.jpg",
};

export const linksGuides: MenuItem[] = [
  guidenextjs,
  guidenodejs,
  guideminting,
  guideownership,
  guideprovider,
  guidetransactions,
  guideaiken,
  guidestandalone,
  guideVesting,
];

export const metaGuides: MenuItem = {
  link: `/guides`,
  title: "Guides",
  desc: "Whether you are new to web development or a seasoned blockchain full-stack developer, these guides will help you get started.",
  icon: DocumentTextIcon,
  items: linksGuides,
};
