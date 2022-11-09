import Link from 'next/link';
import Card from './card';

export default function CardTitleDescImage({
  title,
  desc,
  link,
  thumbnailHeroicon,
  thumbnail,
}: {
  title;
  desc;
  link;
  thumbnailHeroicon?: any | undefined;
  thumbnail?: string | undefined;
}) {
  return (
    <Link href={link}>
      <div>
        <Card className="cursor-pointer h-full">
          {thumbnailHeroicon ? (
            <div className="w-16 dark:text-white">{thumbnailHeroicon}</div>
          ) : (
            <img className="mb-5 rounded-lg" src={thumbnail} />
          )}
          <h2 className="my-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h2>
          <p className="mb-4 font-light text-gray-500 dark:text-gray-400">
            {desc}
          </p>
        </Card>
      </div>
    </Link>
  );
}
