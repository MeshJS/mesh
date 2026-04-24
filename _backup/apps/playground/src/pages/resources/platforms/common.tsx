import { linksFrameworks } from "~/data/links-frameworks";

export function getPageLinks() {
  const sidebarItems = linksFrameworks.map((link) => ({
    label: link.title,
    to: link.link,
  }));
  return sidebarItems;
}

export default function Placeholder() {}
