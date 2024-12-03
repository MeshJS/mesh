import {
  ComputerDesktopIcon,
  PaintBrushIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/solid";

import { MenuItem } from "~/types/menu-item";

export const metaSvelteGettingstarted = {
  title: "Getting Started with Svelte",
  desc: "Svelte frontend components for wallet connections.",
  link: "/svelte/getting-started",
  icon: RocketLaunchIcon,
};
export const metaSvelteUicomponents = {
  title: "UI Components",
  desc: "UI components to speed up your app development.",
  link: "/svelte/ui-components",
  icon: PaintBrushIcon,
};

export const linksSvelte: MenuItem[] = [
  metaSvelteGettingstarted,
  metaSvelteUicomponents,
];

export const metaSvelte = {
  title: "Svelte Components",
  desc: "Svelte frontend components for bringing your Web3 user interface to life.",
  link: "/svelte",
  icon: ComputerDesktopIcon,
  items: linksSvelte,
};
