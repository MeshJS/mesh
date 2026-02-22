import { post } from "./";

export async function searchQuery(query: string) {
  return await post(`google/search`, { query });
}
