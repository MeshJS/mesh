import Link from "~/components/link";
import { Link as RSLink } from "react-scroll";

export default function Sidebar({
  sidebarItems,
}: {
  sidebarItems: { to: string; label: string }[];
}) {
  return (
    <div className="mb-6 mr-6 hidden lg:w-72 xl:block">
      <div className="sticky top-24">
        <aside>
          <nav className="overflow-y-auto rounded-lg border border-gray-200 p-6 font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400 max-h-96">
            <ul className="space-y-4">
              {sidebarItems.map((item, i) => {
                return (
                  <li key={i}>
                    {item.to.startsWith("/") || item.to.startsWith("http") ? (
                      <Link href={item.to}>{item.label}</Link>
                    ) : (
                      <LinkWithinPage key={i} item={item} />
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  );
}

function LinkWithinPage({ item }: { item: { to: string; label: string } }) {
  return (
    <RSLink
      activeClass="text-primary-600 dark:text-primary-500"
      className="cursor-pointer hover:text-black dark:hover:text-white"
      to={item.to}
      spy={true}
      smooth={true}
      duration={500}
      offset={-100}
    >
      {item.label}
    </RSLink>
  );
}
