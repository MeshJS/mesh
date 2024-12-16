import { post } from "./";

export async function searchQuery(query: string) {
  const googleSearchResults = await post(`google/search`, { query });

  const results: any[] = [];

  for (const result of googleSearchResults.items) {
    results.push({
      title: result.title,
      url: result.link.replace("https://meshjs.dev/", "/"),
      displayUrl: result.htmlFormattedUrl,
      snippet: result.htmlSnippet,
    });
  }

  return results;
}
