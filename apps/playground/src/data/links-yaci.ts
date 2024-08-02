import { MenuItem } from "~/types/menu-item";

export const metaYaciGettingStarted = {
  title: "Getting Started",
  desc: "Set up Yaci Dev Kit and start the devnet",
  link: "/yaci/getting-started",
};
export const metaYaciTransactions = {
  title: "Build Transactions",
  desc: "Building and submitting transactions on Yaci",
  link: "/yaci/transactions",
};
export const metaYaciProvider = {
  title: "Yaci Provider",
  desc: "For fetching data and submitting transactions on Yaci",
  link: "/providers/yaci",
};
export const linksYaci: MenuItem[] = [
  metaYaciGettingStarted,
  metaYaciTransactions,
  metaYaciProvider,
];

export const metaYaci: MenuItem = {
  title: "Yaci",
  desc: "A custom Cardano devnet to tailor your devnet needs with a builtin indexer and custom viewer for devnet",
  link: "/yaci",
  items: linksYaci,
};
