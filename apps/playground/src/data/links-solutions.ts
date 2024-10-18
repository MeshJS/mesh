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
  items: linksSolutions,
};
