import {
  AcademicCapIcon,
  Squares2X2Icon,
  StarIcon,
} from "@heroicons/react/24/solid";

import { MenuItem } from "~/types/menu-item";
import { metaAiken } from "./links-aiken";
import { metaGuides } from "./links-guides";
import { metaYaci } from "./links-yaci";

// import { metaFrameworks } from "./links-frameworks";

export const linksGetStarted: MenuItem[] = [
  metaGuides,
  // metaFrameworks,
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
  metaAiken,
  metaYaci,
  // {
  //   link: `/getting-started/starter-templates`,
  //   title: "Starter Templates",
  //   desc: "Kick start your projects with our templates using CLI",
  //   icon: RocketLaunchIcon,
  // },
  // {
  //   link: `/getting-started/migration-manual-installation`,
  //   title: "Migration / Manual Installation",
  //   desc: "Install Mesh into your existing project",
  //   icon: WrenchScrewdriverIcon,
  // },
];

export const metaGetStarted: MenuItem = {
  title: "Get Started",
  desc: "Whether you are new to web development or a seasoned blockchain full-stack developer, Mesh is the SDK for you.",
  link: "/getting-started",
  icon: StarIcon,
  items: linksGetStarted,
};
