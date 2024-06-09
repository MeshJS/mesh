import { Link } from 'react-scroll';

export default function CommonSidebar({ sidebarItems }) {
  return (
    <div className="hidden mb-6 mr-6 xl:block lg:w-72">
      <div className="sticky top-24">
        <aside aria-labelledby="categories-label">
          <h3 id="categories-label" className="sr-only">
            Topics
          </h3>
          <nav className="p-6 font-medium text-gray-500 rounded-lg border border-gray-200 dark:border-gray-700 dark:text-gray-400 overflow-y-auto">
            <ul className="space-y-4">
              {sidebarItems.map((item, i) => {
                return (
                  <li key={i}>
                    <Link
                      activeClass="text-primary-600 dark:text-primary-500"
                      className="hover:text-black dark:hover:text-white cursor-pointer"
                      to={item.to}
                      spy={true}
                      smooth={true}
                      duration={500}
                      offset={-100}
                    >
                      {item.label}
                    </Link>
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
