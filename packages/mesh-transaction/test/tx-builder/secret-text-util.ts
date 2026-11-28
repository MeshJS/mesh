import { inspect } from "node:util";

/*
 * Texts an application may give by mistake where the builder takes an address, a credential, a
 * hash or a number: keys and a recovery phrase. An error raised for such a text is searched for
 * it, and for any 8 characters of it, in every way an application could write the error out.
 */

/** A private key in hex: its first byte is the header of no address */
export const HEX_KEY =
  "9d4c2f7a1b8e63d05f92ac17e4b6083d7f1a5c29e86b04d3c71f9a2e58b6d40c";
/** An extended private key in hex */
export const HEX_EXTENDED_KEY =
  "a83f6e1d09c74b25f8e3a1d67c0b942e5f71d8a36b2c9e04d1f7a85c3e6b902d" +
  "4e7a1c9f3b06d82e5a4c17f9b3e08d6c2a5f91e7d4b03c86a2e9f15d7b4c3a80";
/** The CBOR of a signing key file: its bytes read as an address of a network that is none */
export const KEY_FILE_CBOR =
  "58207c3e9a1f5d28b6e04c73a9f1d26e8b5047c3a9e1f6d28b4c07e3a95f1d62b8e4";
/** A bech32-looking private key */
export const BECH32_KEY =
  "ed25519e_sk1" +
  "q7xk3m9vt2wz8rnyd5hc4jf6gp0s3lu7e9ka2xq8vm4tn6wd3zr5hy7cj2fg9pl0s4u6eqk8xa3mv5tw7nz2dr9hy4cj6fg8p";
/** A recovery phrase */
export const PHRASE = [
  "zebra",
  "oxygen",
  "walnut",
  "pigeon",
  "jungle",
  "marble",
  "quiver",
  "fossil",
  "lizard",
  "cactus",
  "garlic",
  "velvet",
  "hammer",
  "tunnel",
  "kidney",
  "noodle",
  "orbit",
  "pepper",
  "riddle",
  "saddle",
  "toddler",
  "umbrella",
  "vintage",
  "whisky",
].join(" ");

/** Each text, with the part of it no error may show: all but the prefix a bech32 text has */
export const MARKERS: readonly {
  name: string;
  text: string;
  secret: string;
}[] = [
  { name: "a key in hex", text: HEX_KEY, secret: HEX_KEY },
  {
    name: "an extended key in hex",
    text: HEX_EXTENDED_KEY,
    secret: HEX_EXTENDED_KEY,
  },
  {
    name: "the CBOR of a key file",
    text: KEY_FILE_CBOR,
    secret: KEY_FILE_CBOR.slice(4),
  },
  {
    name: "a bech32 key",
    text: BECH32_KEY,
    secret: BECH32_KEY.slice("ed25519e_sk1".length),
  },
  { name: "a recovery phrase", text: PHRASE, secret: PHRASE },
];

/** Every string an error holds: its own members, `details` and the `cause` chain, deeply */
const stringsOf = (value: unknown): string[] => {
  const found: string[] = [];
  const seen = new Set<unknown>();
  const visit = (item: unknown, depth: number) => {
    if (typeof item === "string") return void found.push(item);
    if (typeof item !== "object" || item === null || depth > 12) return;
    if (seen.has(item)) return;
    seen.add(item);
    for (const key of Reflect.ownKeys(item)) {
      let member: unknown;
      try {
        member = (item as Record<string | symbol, unknown>)[key];
      } catch {
        continue;
      }
      visit(member, depth + 1);
    }
  };
  visit(value, 0);
  return found;
};

/** Every way an application could write an error to its logs */
const renderingsOf = (error: unknown): string[] => {
  const shown = [String(error), inspect(error, { depth: 8 })];
  try {
    shown.push(
      JSON.stringify(error, (_key, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
      ) ?? "",
    );
  } catch {
    // An error that cannot be written as JSON is searched by its other renderings
  }
  if (error instanceof Error) shown.push(error.message, error.stack ?? "");
  return [...shown, ...stringsOf(error)];
};

/** The first run of 8 characters of the secret found in what the error shows, if any */
export const leakOf = (error: unknown, secret: string): string | undefined => {
  const shown = renderingsOf(error).join("\n");
  for (let i = 0; i + 8 <= secret.length; i++) {
    const run = secret.slice(i, i + 8);
    if (shown.includes(run)) return run;
  }
  return undefined;
};

export const caught = async (run: () => unknown): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected an error");
};
