import { MenuItem } from "~/types/menu-item";

export const metaHydraGettingStarted = {
  title: "Getting Started",
  desc: "Setting up your system to work with Hydra",
  link: "/hydra/getting-started",
};

export const linksHydra: MenuItem[] = [metaHydraGettingStarted];

export const metaHydra: MenuItem = {
  title: "Hydra",
  desc: "Layer 2 scaling solution for Cardano",
  link: "/hydra",
  items: linksHydra,
};
