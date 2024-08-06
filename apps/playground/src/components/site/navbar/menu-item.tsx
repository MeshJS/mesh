import Link from "~/components/link/link";

export default function MenuItem({
  title,
  link,
}: {
  title: string;
  link: string;
}) {
  return (
    <li>
      <Link
        href={link}
        className="lg:hover:text-primary-600 lg:dark:hover:text-primary-500 dark:hover:text-primary-500 block border-b border-gray-100 py-2 pl-3 pr-4 text-gray-700 hover:bg-gray-50 lg:border-0 lg:p-0 lg:hover:bg-transparent dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 lg:dark:hover:bg-transparent"
      >
        {title}
      </Link>
    </li>
  );
}
