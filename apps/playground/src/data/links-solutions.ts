<<<<<<< HEAD
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
=======
import { CloudIcon, FireIcon, UserGroupIcon } from "@heroicons/react/24/solid";

import { MenuItem } from "~/types/menu-item";
import { metaSmartContract } from "./links-smart-contracts";

export const linksSolutions: MenuItem[] = [
  metaSmartContract,
  {
    link: `https://multisig.meshjs.dev/`,
    title: "Multisig platform",
    desc: "Secure your treasury and participant in Cardano governance as a team with multi-signature",
    icon: UserGroupIcon,
  },
  {
    link: `https://cloud.meshjs.dev/`,
    title: "Cloud Services",
    desc: "Hosted services for your blockchain applications",
    icon: CloudIcon,
  },
];

export const metaSolutions: MenuItem = {
  title: "Solutions",
  desc: "Mesh provides a set of solutions to help you build blockchain applications",
  link: "/solutions",
  icon: FireIcon,
>>>>>>> 8500c9d7251caf6932bed24a52c215815e4fdcc6
  items: linksSolutions,
};
