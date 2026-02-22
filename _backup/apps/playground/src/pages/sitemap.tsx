import type { NextPage } from "next";

import CenterPadded from "~/components/layouts/root/center-padded";
import CenterAlignHeaderParagraph from "~/components/sections/center-align-header-paragraph";
import Metatags from "~/components/site/metatags";
import Sitemap from "../components/site/footer/sitemap";

const ReactPage: NextPage = () => {
  return (
    <>
      <Metatags title={"Site Map"} />
      <CenterPadded>
        <CenterAlignHeaderParagraph headerTitle={`Mesh Site Map`}>
          <></>
        </CenterAlignHeaderParagraph>
        <Sitemap />
      </CenterPadded>
    </>
  );
};

export default ReactPage;
