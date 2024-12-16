import { MenuItem } from "~/types/menu-item";

export const metaMidnightGettingStarted = {
  title: "Getting Started",
  desc: "Setting up your system to work with Midnight",
  link: "/midnight/getting-started",
};

export const linksMidnight: MenuItem[] = [metaMidnightGettingStarted];

export const metaMidnight: MenuItem = {
  title: "Midnight",
  desc: "Leveraging zero-knowledge technology to enable data protection",
  link: "/midnight",
  items: linksMidnight,
};

