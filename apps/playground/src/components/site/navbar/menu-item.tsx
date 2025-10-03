import Link from "~/components/link";

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
        className="block border-b border-neutral-100 py-2 pl-3 pr-4 text-neutral-700 hover:bg-neutral-50 hover:no-underline lg:border-0 lg:p-0 lg:hover:bg-transparent lg:hover:text-black dark:border-neutral-700 dark:text-white dark:hover:bg-neutral-700 dark:hover:text-white lg:dark:hover:bg-transparent lg:dark:hover:text-white"
      >
        {title}
      </Link>
    </li>
  );
}
