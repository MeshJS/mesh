import Link from "~/components/link";
import { linksAbout } from "~/data/links-about";
import { linksApi } from "~/data/links-api";
import { metaGuides } from "~/data/links-guides";
import { metaResources } from "~/data/links-resources";
import { metaSmartContract } from "~/data/links-smart-contracts";
import { metaSolutions } from "~/data/links-solutions";
import { MenuItem } from "~/types/menu-item";

export default function Sitemap() {
  return (
    <div className="mx-auto max-w-screen-xl p-4 py-6 md:p-8 lg:p-10">
      <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-4">
        {linksApi.map((api, i) => (
          <Section menuItem={api} key={i} />
        ))}

        <Section menuItem={metaSolutions} />
        <Section menuItem={metaResources} />
        <Section menuItem={metaSmartContract} />
        <Section menuItem={metaGuides} />

        <div>
          <h2 className="mb-6 text-sm font-semibold uppercase text-gray-900 dark:text-white">
            About Mesh
          </h2>
          <ul className="text-gray-500 dark:text-gray-400">
            {linksAbout.map((about, i) => (
              <SitemapLinks href={about.link} label={about.title} key={i} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SitemapLinks({ href, label }: { href: string; label: string }) {
  return (
    <li className="mb-4 list-none">
      <Link href={href}>
        <div className="cursor-pointer hover:underline">{label}</div>
      </Link>
    </li>
  );
}

function Section({ menuItem }: { menuItem: MenuItem }) {
  return (
    <div>
      <h2 className="mb-6 text-sm font-semibold uppercase text-gray-900 dark:text-white">
        <SitemapLinks href={menuItem.link} label={menuItem.title} />
      </h2>
      <ul className="text-gray-500 dark:text-gray-400">
        {menuItem.items ? (
          menuItem.items.map((link, i) => (
            <SitemapLinks href={link.link} label={link.title} key={i} />
          ))
        ) : (
          <SitemapLinks href={menuItem.link} label={menuItem.title} />
        )}
      </ul>
    </div>
  );
}
