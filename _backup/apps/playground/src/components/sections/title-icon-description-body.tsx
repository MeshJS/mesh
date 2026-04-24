import React from "react";

import Header2 from "~/components/text/header2";
import Paragraph2 from "~/components/text/paragraph2";

export default function TitleIconDescriptionBody({
  children,
  title,
  description,
  heroicon,
}: {
  children: React.ReactNode;
  title: string;
  description?: string;
  heroicon?: any;
}) {
  return (
    <div className="mb-8">
      <div className="mb-4 lg:mb-6">
        <Header2 heroicon={heroicon}>{title}</Header2>
        {description && <Paragraph2>{description}</Paragraph2>}
      </div>
      <div className="max-w-screen-lg">{children}</div>
    </div>
  );
}
