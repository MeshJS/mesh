import React from "react";
import Image from "next/image";
import Link from "~/components/link";

import Card from "./card";

export default function CardTitleDescImage({
  title,
  desc,
  link,
  thumbnailHeroicon,
  thumbnailImage,
  thumbnailNotioly,
}: {
  title: string;
  desc?: string;
  link: string;
  thumbnailHeroicon?: any;
  thumbnailImage?: string;
  thumbnailNotioly?: string;
}) {
  return (
    <Link href={link}>
      <Card className="h-full cursor-pointer">
        {thumbnailHeroicon ? (
          <div className="w-16 dark:text-white">
            {React.createElement(thumbnailHeroicon)}
          </div>
        ) : thumbnailNotioly ? (
          <div className="relative h-40 w-full bg-white">
            <span className="absolute right-0 top-0 flex h-full w-1/2 flex-col justify-center">
              <div className="text-2xl font-black">{title}</div>
            </span>
            <Image
              src="/logo-mesh/black/logo-mesh-black-64x64.png"
              className="absolute bottom-2 right-2 h-8"
              layout="fill"
              objectFit="contain"
              alt={title}
            />
            <Image
              src={`/notioly/Main/${thumbnailNotioly}.svg`}
              className="h-full"
              layout="fill"
              objectFit="contain"
              alt={title}
            />
          </div>
        ) : (
          thumbnailImage && (
            <Image
              className="mb-5 rounded-lg object-contain h-48 w-full"
              src={thumbnailImage}
              alt={title}
              width={640}
              height={640}
            />
          )
        )}
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          {title}
        </h2>
        {desc && (
          <p className="font-light text-gray-500 dark:text-gray-400">{desc}</p>
        )}
      </Card>
    </Link>
  );
}
