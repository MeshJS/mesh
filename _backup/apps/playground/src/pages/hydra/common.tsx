import { linksHydra } from "~/data/links-hydra";

export function getPageLinks() {
  const sidebarItems = linksHydra.map((link) => ({
    label: link.title,
    to: link.link,
  }));
  return sidebarItems;
}

export default function Placeholder() {}
