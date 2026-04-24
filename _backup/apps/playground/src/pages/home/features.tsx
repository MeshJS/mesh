import React from "react";

import CardTitleDescImage from "~/components/card/card-title-desc-image";
import { linksApi } from "~/data/links-api";

export default function SectionFeatures() {
  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8 lg:px-6">
      <div className="space-y-8 md:grid md:grid-cols-2 md:gap-8 md:space-y-0 lg:grid-cols-3 xl:grid-cols-4 xl:gap-8">
        {linksApi.map((item, i) => (
          <CardTitleDescImage
            title={item.title}
            desc={item.desc}
            link={item.link}
            icon={item.icon}
            thumbnailImage={item.thumbnail}
            key={i}
          />
        ))}
      </div>
    </div>
  );
}
