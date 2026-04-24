import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";

import { searchBlacklistLinks } from "~/data/search-blacklist-links";

async function querySearchApi(
  query: string,
  page = 1,
): Promise<{
  items: {
    title: string;
    link: string;
    htmlFormattedUrl: string;
    htmlSnippet: string;
  }[];
}> {
  const start = (page - 1) * 10 + 1;
  const resGoogle = await axios.get(
    `https://customsearch.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_SEARCH_API}&cx=${process.env.GOOGLE_SEARCH_CX}&num=10&q=${query}&start=${start}`,
  );
  return resGoogle.data;
}

export default async function handler(
  _req: NextApiRequest,
  _res: NextApiResponse,
) {
  try {
    const query = _req.body.query;

    const results: any = [];

    for (let i = 1; i <= 2; i++) {
      const searchRes = await querySearchApi(query, i);

      const items = searchRes.items
        // filter results
        .filter((item) => {
          // filter out any results with middot, these are from the footer
          if (item.htmlSnippet.includes("&middot;")) {
            return false;
          }
          // if link is in blacklist, filter it out
          if (searchBlacklistLinks.some((link) => item.link.includes(link))) {
            return false;
          }
          return true;
        })
        // transform the data
        .map((item) => {
          return {
            title: item.title,
            url: item.link.replace("https://meshjs.dev/", "/"),
            displayUrl: item.htmlFormattedUrl,
            snippet: item.htmlSnippet,
          };
        })
        // lastly filter any duplicated urls
        .filter(
          (item, index, self) =>
            index === self.findIndex((t) => t.url === item.url),
        );

      results.push(...items);
      if (searchRes.items.length < 10) {
        break;
      }
    }

    _res.status(200).json(results);
  } catch (error) {
    _res.status(500).json(error);
  }
}
