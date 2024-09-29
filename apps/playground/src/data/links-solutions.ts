import {
  BeakerIcon,
  CloudIcon,
  KeyIcon,
} from "@heroicons/react/24/solid";

import { MenuItem } from "~/types/menu-item";

export const linksSolutions: MenuItem[] = [
  {
    link: `https://cloud.meshjs.dev/`,
    title: "Cloud and SaaS",
    desc: "Mesh Cloud provides a managed environments and services for your Mesh development.",
    icon: CloudIcon,
  },
  {
    link: `https://multisig.meshjs.dev/`,
    title: "Multisig Platform",
    desc: "Secure your treasury and participant in Cardano governance as a team with multi-signature",
    icon: KeyIcon,
  },
];

export const metaGetStarted: MenuItem = {
  title: "Solutions",
  desc: "Mesh provides a range of solutions to help you get started with your development journey.",
  link: "/",
  icon: BeakerIcon,
  items: linksSolutions,
};
