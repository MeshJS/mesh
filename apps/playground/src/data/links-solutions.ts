import {
  FireIcon,
  GlobeAltIcon,
  UserGroupIcon,
} from "@heroicons/react/24/solid";

import { MenuItem } from "~/types/menu-item";
import { metaSmartContract } from "./links-smart-contracts";

export const linksSolutions: MenuItem[] = [
  {
    link: `https://web3.meshjs.dev/`,
    title: "Web3 Services",
    desc: "Streamline user onboarding and Web3 integration, accelerating your app's time to market",
    icon: GlobeAltIcon,
  },
  metaSmartContract,
  {
    link: `https://multisig.meshjs.dev/`,
    title: "Multisig platform",
    desc: "Secure your treasury and participant in Cardano governance as a team with multi-signature",
    icon: UserGroupIcon,
  },
];

export const metaSolutions: MenuItem = {
  title: "Solutions",
  desc: "Mesh provides a set of solutions to help you build blockchain applications",
  link: "/solutions",
  icon: FireIcon,
  items: linksSolutions,
};
