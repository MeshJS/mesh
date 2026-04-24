import { linksAbout } from "~/data/links-about";
import { linksApi } from "~/data/links-api";
import { linksGuides } from "~/data/links-guides";
import { linksResources } from "~/data/links-resources";
import { linksSmartContracts } from "~/data/links-smart-contracts";
import { linksSolutions } from "~/data/links-solutions";
import { rootUrl } from "~/data/site";
import { MenuItem } from "~/types/menu-item";

function generateSiteMap(pagesUrls: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
   <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
     <url>
       <loc>${rootUrl}</loc>
     </url>
     ${pagesUrls
       .map((url) => {
         return `
       <url>
           <loc>${url.startsWith("http") ? url : `${rootUrl}${url}`}</loc>
       </url>
     `;
       })
       .join("")}
   </urlset>
 `;
}

function SiteMap() {}

function addLinks(pagesUrls: string[], pages: MenuItem[]) {
  pages.forEach((api) => {
    pushLink(pagesUrls, api.link);
    if (api.items) {
      api.items.forEach((item) => {
        pushLink(pagesUrls, item.link);
      });
    }
  });
}

function pushLink(pagesUrls: string[], link: string) {
  if (link.includes("http") && !link.includes("meshjs.dev")) {
    return;
  }
  pagesUrls.push(link);
}

export async function getServerSideProps({ res }: { res: any }) {
  const pagesUrls: string[] = [];

  addLinks(pagesUrls, linksResources);
  addLinks(pagesUrls, linksGuides);
  addLinks(pagesUrls, linksApi);
  addLinks(pagesUrls, linksSmartContracts);
  addLinks(pagesUrls, linksSolutions);
  addLinks(pagesUrls, linksAbout);

  const sitemap = generateSiteMap(pagesUrls);

  res.setHeader("Content-Type", "text/xml");
  res.write(sitemap);
  res.end();

  return {
    props: {},
  };
}

export default SiteMap;
