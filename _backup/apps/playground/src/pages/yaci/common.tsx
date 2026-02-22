import { linksYaci } from "~/data/links-yaci";

export function getPageLinks() {
  const sidebarItems = linksYaci.map((link) => ({
    label: link.title,
    to: link.link,
  }));
  return sidebarItems;
}

export default function Placeholder() {}
