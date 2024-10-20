import { CloudIcon } from "@heroicons/react/24/solid";

import { MenuItem } from "~/types/menu-item";

export const metaMaestro = {
  title: "Maestro Provider",
  link: "/providers/maestro",
  desc: "Advanced UTxO-indexing data layer to supercharge Defi on Bitcoin, Cardano & Dogecoin",
  thumbnail: "/providers/maestro.png",
};

export const metaKoios = {
  title: "Koios Provider",
  link: "/providers/koios",
  desc: "Distributed & open-source public API query layer for Cardano",
  thumbnail: "/providers/koios.png",
};

export const metaBlockfrost = {
  title: "Blockfrost Provider",
  link: "/providers/blockfrost",
  desc: "Featuring over 100 APIs tailored for easy access to Cardano blockchain",
  thumbnail: "/providers/blockfrost.png",
};

export const metaU5c = {
  title: "UTxORPC Provider",
  link: "/providers/utxorpc",
  desc: "Highly efficient through gRPC, using a compact and high-performance binary format",
  thumbnail: "/providers/utxo-rpc.png",
};

export const metaYaci = {
  title: "Yaci Provider",
  link: "/providers/yaci",
  desc: "Custom Cardano devnet to tailor your devnet needs with a builtin indexer and custom viewer for devnet",
  thumbnail: "/providers/yaci.png",
};

export const metaOgmios = {
  title: "Ogmios Provider",
  link: "/providers/ogmios",
  desc: "Lightweight bridge interface for cardano-node that offers WebSockets API that enables local clients to speak Ouroboros' mini-protocols",
  thumbnail: "/providers/ogmios.png",
};

export const metaHydra = {
  title: "Hydra Provider (alpha)",
  link: "/providers/hydra",
  desc: "Layer 2 scaling solution for Cardano that increases transaction throughput and ensures cost efficiency while maintaining security.",
  thumbnail: "/providers/hydra.svg",
};

export const linksProviders: MenuItem[] = [
  metaBlockfrost,
  metaKoios,
  metaMaestro,
  // metaHydra,
  metaOgmios,
  metaU5c,
  metaYaci,
];

export const metaProviders = {
  title: "Providers",
  desc: "Data providers for connecting to the blockchain",
  link: "/providers",
  icon: CloudIcon,
  items: linksProviders,
};
