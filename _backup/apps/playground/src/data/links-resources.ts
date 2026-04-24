import {
  AcademicCapIcon,
  DocumentTextIcon,
  Squares2X2Icon,
  StarIcon,
} from "@heroicons/react/24/solid";

import { MenuItem } from "~/types/menu-item";
import { metaGuides } from "./links-guides";

export const linksResources: MenuItem[] = [
  metaGuides,
  {
    title: "Documentation",
    desc: "Full documentation for MeshJS",
    link: "https://docs.meshjs.dev/",
    icon: DocumentTextIcon,
  },
  {
    link: `https://github.com/MeshJS/examples`,
    title: "Examples",
    desc: "Explore our examples to get started",
    icon: Squares2X2Icon,
  },
  {
    link: `https://pbl.meshjs.dev/`,
    title: "Project Based Learning",
    desc: "Start your building journey",
    icon: AcademicCapIcon,
  },
];

export const metaResources: MenuItem = {
  title: "Resources",
  desc: "Whether you are new to web development or a seasoned blockchain full-stack developer, Mesh is the SDK for you.",
  link: "/resources",
  icon: StarIcon,
  items: linksResources,
};
