import { CpuChipIcon } from "@heroicons/react/24/solid";

import { MenuItem } from "~/types/menu-item";

export const metaNextjs = {
  title: "Next.js",
  desc: "React-based web applications with server-side rendering and static website generation",
  link: "/getting-started/frameworks/nextjs",
};

export const metaSvelte = {
  title: "Svelte",
  desc: "Cybernetically enhanced web apps",
  link: "/getting-started/frameworks/svelte",
};

// vite
// svelte
// vue
// angular
// react
// gatsby
// nuxt
// react-native


export const linksFrameworks: MenuItem[] = [metaNextjs, metaSvelte];

export const metaFrameworks: MenuItem = {
  title: "Setup on Frameworks",
  desc: "Get started with Mesh on different frameworks",
  link: "/getting-started/frameworks",
  items: linksFrameworks,
  icon: CpuChipIcon,
};
