import { TxBuildError } from "./errors";
import { canSign } from "./sign";

// The reading of the options object of a call: an object with no member but those the call
// knows. What is given in its place, or as a member of it, may be or hold a key, so a refusal
// names only the JavaScript type of what was given, never the value.

/** The JavaScript type of a value, with `null` told apart */
export const typeOf = (value: unknown) =>
  value === null ? "null" : typeof value;

/** Whether a value has a method of this name */
export const hasMethod = (value: unknown, name: string) =>
  (typeof value === "object" || typeof value === "function") &&
  value !== null &&
  typeof (value as Record<string, unknown>)[name] === "function";

/**
 * An option of a call that is refused. What is given there may be or hold a key, so the message
 * and `details.value` name only its JavaScript type, never the value
 */
export const invalidOption = (
  option: string,
  value: unknown,
  allowed: string,
  hint = "",
) =>
  new TxBuildError(
    "INVALID_OPTION",
    `invalid ${option}: expected ${allowed}; got a value of type ${typeOf(value)}${hint}`,
    { details: { option, value: typeOf(value), allowed } },
  );

/** A member name an error may show: a plain identifier, short */
const SHOWN_MEMBER = /^[A-Za-z_$][\w$]{0,31}$/;

/**
 * Refuses options with an own enumerable member that is not among `known`: a misspelled member
 * would be dropped, and the call would do what it does without it. The name is given by the
 * caller, so the message shows it only when it is a short plain identifier
 * @throws TxBuildError INVALID_OPTION
 */
export const refuseUnknownMembers = (
  options: object,
  known: readonly string[],
  allowed: string,
) => {
  const name = Object.keys(options).find((key) => !known.includes(key));
  const symbol = Object.getOwnPropertySymbols(options).some((key) =>
    Object.prototype.propertyIsEnumerable.call(options, key),
  );
  if (name === undefined && !symbol) return;
  throw new TxBuildError(
    "INVALID_OPTION",
    `invalid options: expected ${allowed}; got an object with ${
      name !== undefined && SHOWN_MEMBER.test(name)
        ? `the unknown member ${name}`
        : "an unknown member"
    }`,
    { details: { option: "options", value: typeOf(options), allowed } },
  );
};

/** A value of another kind given in place of a call's options, and how it is given instead */
export type GivenInPlace = {
  /** Whether the value is of this kind */
  readonly is: (value: unknown) => boolean;
  /** How it is given, a clause of the message */
  readonly hint: string;
};

/** A signer, or what reads as one: a value whose signing method throws when it is read */
const givenAsSigner = (value: unknown) => {
  try {
    return canSign(value);
  } catch {
    return true;
  }
};

/** What a call that takes `signers` finds given in place of its options */
export const SIGNERS_IN_PLACE: readonly GivenInPlace[] = [
  {
    is: (value) => typeof value === "string",
    hint: "a private key is given as { signers: keySigner(key) }",
  },
  { is: givenAsSigner, hint: "a signer is given as { signers }" },
  {
    is: (value) => Array.isArray(value),
    hint: "signers are given as { signers: [...] }",
  },
];

/** What a call that takes `submitter` finds given in place of its options */
export const SUBMITTER_IN_PLACE: GivenInPlace = {
  is: (value) => hasMethod(value, "submitTx"),
  hint: "a submitter is given as { submitter }",
};

/**
 * Options of a call that are an object with no member but those it knows, else INVALID_OPTION:
 * `undefined` is none
 * @param known The members the call knows
 * @param allowed What the call takes, as its messages say it
 * @param given The values of other kinds a call finds given in place of its options, each with
 *   how it is given instead
 * @throws TxBuildError INVALID_OPTION
 */
export const optionsObject = (
  options: unknown,
  known: readonly string[],
  allowed: string,
  given: readonly GivenInPlace[] = [],
): Record<string, unknown> => {
  if (options === undefined) return {};
  const hints = given.filter(({ is }) => is(options)).map(({ hint }) => hint);
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options) ||
    hints.length > 0
  )
    throw invalidOption(
      "options",
      options,
      allowed,
      hints.map((hint) => `; ${hint}`).join(""),
    );
  refuseUnknownMembers(options, known, allowed);
  return options as Record<string, unknown>;
};
