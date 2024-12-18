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
        className="lg:hover:text-black lg:dark:hover:text-white dark:hover:text-white block border-b border-neutral-100 py-2 pl-3 pr-4 text-neutral-700 hover:bg-neutral-50 lg:border-0 lg:p-0 lg:hover:bg-transparent dark:border-neutral-700 dark:text-white dark:hover:bg-neutral-700 lg:dark:hover:bg-transparent hover:no-underline"
      >
        {title}
      </Link>
    </li>
  );
}
