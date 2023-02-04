import Link from 'next/link';
import Card from './card';

export default function CardTitleDescImage({
  title,
  desc,
  link,
  thumbnailHeroicon,
  thumbnail,
  thumbnailNotioly,
}: {
  title;
  desc?;
  link;
  thumbnailHeroicon?: any | undefined;
  thumbnail?: string | undefined;
  thumbnailNotioly?: string | undefined;
}) {
  return (
    <Link href={link}>
      <div>
        <Card className="cursor-pointer h-full">
          {thumbnailHeroicon ? (
            <div className="w-16 dark:text-white">{thumbnailHeroicon}</div>
          ) : thumbnailNotioly ? (
            <div className="w-full h-40 bg-white relative">
              <span className="absolute h-full w-1/2 top-0 right-0 flex flex-col justify-center">
                <div className="text-2xl font-black">{title}</div>
              </span>
              <img
                src="/logo-mesh/black/logo-mesh-black-64x64.png"
                className="absolute bottom-2 right-2 h-8"
              />
              <img
                src={`/notioly/Main/${thumbnailNotioly}.svg`}
                className="h-full"
              />
            </div>
          ) : (
            thumbnail && <img className="mb-5 rounded-lg" src={thumbnail} />
          )}
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h2>
          {desc && (
            <p className="font-light text-gray-500 dark:text-gray-400">
              {desc}
            </p>
          )}
        </Card>
      </div>
    </Link>
  );
}
