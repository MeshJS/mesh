import { CloudIcon } from "@heroicons/react/24/solid";

import { MenuItem } from "~/types/menu-item";

export const metaMaestro = {
  title: "Maestro",
  link: "/providers/maestro",
  desc: "Advanced UTxO-indexing data layer to supercharge Defi on Bitcoin, Cardano & Dogecoin",
  thumbnail: "/providers/maestro.png",
};

export const metaKoios = {
  title: "Koios",
  link: "/providers/koios",
  desc: "Distributed & open-source public API query layer for Cardano",
  thumbnail: "/providers/koios.png",
};

export const metaBlockfrost = {
  title: "Blockfrost",
  link: "/providers/blockfrost",
  desc: "Featuring over 100 APIs tailored for easy access to Cardano blockchain",
  thumbnail: "/providers/blockfrost.png",
};

export const metaYaci = {
  title: "Yaci DevKit",
  link: "/providers/yaci",
  desc: "Custom Cardano devnet to tailor your devnet needs with a builtin indexer and custom viewer for devnet",
  thumbnail: "/providers/yaci.png",
};

export const metaOgmios = {
  title: "Ogmios",
  link: "/providers/ogmios",
  desc: "Lightweight bridge interface for cardano-node that offers WebSockets API that enables local clients to speak Ouroboros' mini-protocols",
  thumbnail: "/providers/ogmios.png",
};

export const linksProviders: MenuItem[] = [
  metaBlockfrost,
  metaKoios,
  metaMaestro,
  metaOgmios,
  metaYaci,
];

export const metaProviders = {
  title: "Providers",
  desc: "Data providers for connecting to the blockchain",
  link: "/providers",
  icon: CloudIcon,
  items: linksProviders,
};
