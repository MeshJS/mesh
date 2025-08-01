import SvgHydra from "~/components/svgs/hydra";
import { MenuItem } from "~/types/menu-item";
import { metaHydraProvider } from "./links-providers";

export const metaHydraGettingStarted = {
  title: "Getting Started",
  desc: "Setting up your system to work with Hydra",
  link: "/hydra/getting-started",
};
export const metaHydraTutorial = {
  title: "End-to-end Hydra Tutorial",
  desc: "Open a layer 2 state channel between two participants, build transactions, and close the Hydra head",
  link: "/hydra/tutorial",
};

export const linksHydra: MenuItem[] = [
  // metaHydraGettingStarted,
  metaHydraProvider,
  metaHydraTutorial,
];

export const metaHydra: MenuItem = {
  title: "Hydra",
  desc: "Layer 2 scaling solution for Cardano",
  link: "/hydra",
  items: linksHydra,
  icon: SvgHydra,
};
