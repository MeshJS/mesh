import type { NextPage } from "next";

import HeaderAndCards from "~/components/layouts/header-and-cards";
import Metatags from "~/components/site/metatags";
import { linksSvelte, metaSvelte } from "~/data/links-svelte";

const SveltePage: NextPage = () => {
  return (
    <>
      <Metatags title={metaSvelte.title} description={metaSvelte.desc} />
      <HeaderAndCards
        headerTitle={metaSvelte.title}
        headerParagraph={metaSvelte.desc}
        listCards={linksSvelte}
      />
    </>
  );
};

export default SveltePage;
