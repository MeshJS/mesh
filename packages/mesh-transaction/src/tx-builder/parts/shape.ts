// What an error tells of a value given where a text is taken that may be a key given by mistake
// (an address, among others): its shape, never the text

/**
 * What a text is, without the text: its length, and the prefix of a bech32 text, which says what
 * kind of thing it is. For an error about a text that may be a key given by mistake
 */
export const textShape = (text: string): string => {
  if (/^[0-9a-fA-F]+$/.test(text)) return `${text.length} hex digits`;
  const prefix = /^([a-z0-9_]{1,20})1[02-9ac-hj-np-z]{6,}$/i.exec(text)?.[1];
  return prefix === undefined
    ? `text of ${text.length} characters`
    : `text of ${text.length} characters with the prefix ${prefix.toLowerCase()}`;
};

/**
 * What was given where an address is taken, without the value: the shape of a text, the
 * JavaScript type of anything else
 */
export const givenShape = (value: unknown): string =>
  typeof value === "string"
    ? textShape(value)
    : `a value of type ${value === null ? "null" : typeof value}`;

/**
 * A value given by mistake, as an error tells it: a text by its shape, a number, a bigint, a
 * boolean or undefined as it is, anything else by its JavaScript type. A text may be a key given
 * by mistake; an object or a list may hold one
 */
export const shownValue = (value: unknown): string => {
  switch (typeof value) {
    case "string":
      return textShape(value);
    case "number":
    case "bigint":
    case "boolean":
    case "undefined":
      return String(value);
    default:
      return givenShape(value);
  }
};

/**
 * A value given by mistake, as the `details` of an error hold it: a number, a bigint, a boolean,
 * null or undefined as it is, anything else (a text, an object, a list) by its JavaScript type
 */
export const heldValue = (value: unknown): unknown =>
  value === null ||
  ["number", "bigint", "boolean", "undefined"].includes(typeof value)
    ? value
    : typeof value;
