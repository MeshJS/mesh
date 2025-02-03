import { MenuItem } from "~/types/menu-item";

export const metaMidnightGettingStarted = {
  title: "Getting Started",
  desc: "Setting up your system to work with Midnight",
  link: "/midnight/getting-started",
};
export const metaMidnightTutorial = {
  title: "End-to-end Midnight Tutorial",
  desc: "This tutorial demonstrates how to use Midnight to build a simple application",
  link: "/midnight/tutorial",
};

export const linksMidnight: MenuItem[] = [
  metaMidnightGettingStarted,
  metaMidnightTutorial,
];

export const metaMidnight: MenuItem = {
  title: "Midnight",
  desc: "Leveraging zero-knowledge technology to enable data protection",
  link: "/midnight",
  items: linksMidnight,
};
