import { FilmIcon, HeartIcon } from "@heroicons/react/24/solid";

import { MenuItem } from "~/types/menu-item";
import { metaCatalyst } from "./catalyst";

export const metaAboutUs = {
  link: `/about`,
  title: "About Us",
  desc: "",
  icon: HeartIcon,
};
export const metaSupportUs = {
  link: `/about/support-us`,
  title: "Support Us",
  desc: "Thank you for your interest in Mesh, we appreciate any kind of support! Here are some ways you can support us.",
  icon: HeartIcon,
};
export const metaMediaKit = {
  link: `/about/media-kit`,
  title: "Media Kit",
  desc: "Choose from these logo files. These resources exist to help you use Mesh's assets.",
  icon: FilmIcon,
};

export const linksAbout: MenuItem[] = [
  metaAboutUs,
  metaCatalyst,
  metaSupportUs,
  metaMediaKit,
];
