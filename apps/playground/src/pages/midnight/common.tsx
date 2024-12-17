import { linksMidnight } from "~/data/links-midnight";

export function getPageLinks() {
  const sidebarItems = linksMidnight.map((link) => ({
    label: link.title,
    to: link.link,
  }));
  return sidebarItems;
}

export default function Placeholder() {}
