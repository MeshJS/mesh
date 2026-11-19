import type { BuiltTxData } from "../builder";
import type { LinkedPart, TxPart, Utxo } from "../parts/types";
import type {
  BeforeEntry,
  PlanBefore,
  PlanRecord,
  PlanTip,
  StepRecord,
} from "./core";
import { isKeyLocked } from "../balance";
import {
  atFinalDepth,
  MAX_PAYS,
  pastMarginAt,
  sourcesOf,
  stepUntil,
} from "./core";

// What keeps a plan made in place of another from landing beside it, worked out from data: which
// transactions of the plans before are kept, open, used up or dead after a look; which open
// transactions a step built could land beside; the input a new step spends so that the ledger
// takes one of the two and never both; and what the new record keeps of the plans before it. It
// makes no request and reads no clock: the look's answers and its tip come in as arguments.
// Nothing here is exported from the package.
//
// Words. The line of a plan is the plan and the plans it was made in place of. A transaction of
// the line is kept when it is final; taken when it is a step of the plan replaced that the look
// found in a block, not final, which the new plan holds as a step of its own; open when it is
// neither. A transaction stands on another when
// it spends, reads or puts up one of its regular outputs. Two transactions are kept apart when
// one of them, or a transaction it stands on, spends an out ref that the other, or a transaction
// that one stands on, spends too: no chain holds both. The collateral return of a transaction,
// the output after its regular ones, exists only when its scripts failed and it spent none of
// its inputs: a reference to it stands on nothing.

/**
 * A transaction's body as the rule reads it: its hash, what it spends, reads and puts up, and
 * its validity
 */
export type RuleBody = Pick<
  BuiltTxData,
  "txHash" | "inputs" | "referenceInputs" | "collateral" | "validity"
> &
  Partial<Pick<BuiltTxData, "outputs" | "redeemers">>;

/** A step: one a build made, or one a record holds */
export type StepTx = {
  readonly name: string;
  readonly kind?: StepRecord["kind"];
  readonly built: RuleBody;
};

/**
 * A transaction of a line as the rule reads it. `lineTxOf` gives it from a step, made or
 * recorded, or from an entry of `before.open`; `lineClasses` gives it with what a look made of
 * it
 */
export type LineTx = {
  /** The name of its step */
  readonly step: string;
  /** The hash of its body, in lower case */
  readonly txHash: string;
  /** The out refs it spends, `txHash#index` with the hash in lower case, in body order */
  readonly spends: readonly string[];
  /**
   * The hashes, in lower case, of the transactions whose outputs it spends, reads or puts up;
   * of an entry, those of the out refs it spends alone: an entry keeps nothing else
   */
  readonly sources: readonly string[];
  /**
   * The out refs it spends, reads or puts up, `txHash#index` with the hash in lower case; of an
   * entry, those it spends alone
   */
  readonly refs: readonly string[];
  /**
   * How many regular outputs it makes; the output at this index is its collateral return. Absent
   * when not known: nothing stands on it then
   */
  readonly outputs?: number;
  /** A step the plan put in itself to gather its payer's UTxOs */
  readonly consolidation?: true;
  /** The end of its validity, POSIX ms; absent when it has none */
  readonly until?: number;
  /** The block it was found in once */
  readonly seen?: { readonly slot: number; readonly block?: string };
  /** It runs a Plutus script */
  readonly plutus?: true;
  /** The addresses it pays, each once, in the order of its outputs, at most 16 */
  readonly pays?: readonly string[];
  /** How many addresses it pays past the 16 of `pays`; absent when `pays` holds them all */
  readonly paysMore?: number;
  /** In a block for good with failed scripts: it paid nobody and cannot land again */
  readonly usedUp?: true;
  /** It cannot land, by the plan's own rules, and no look ever found it in a block */
  readonly dead?: true;
  /**
   * Found in a block once, and out of it by a look that would call it dead had it never been
   * found: it lands again only if the chain goes back to the blocks that held it
   */
  readonly gone?: true;
};

/** What the rule takes for a transaction: a step, an entry of `before.open`, or a `LineTx` */
export type LineInput = StepTx | BeforeEntry | LineTx;

/** An out ref as `txHash#index`, with the hash in lower case */
export const outRefKey = (txHash: string, index: number) =>
  `${txHash.toLowerCase()}#${index}`;

const hashOfOutRef = (outRef: string) =>
  outRef.slice(0, outRef.indexOf("#")).toLowerCase();

/** The addresses outputs pay, each once, in their order, at most `MAX_PAYS` */
const paysOf = (outputs: readonly { readonly address: string }[]) =>
  Array.from(new Set(outputs.map((output) => output.address))).slice(
    0,
    MAX_PAYS,
  );

/** How many addresses outputs pay past the first `MAX_PAYS`; 0 when none */
const paysMoreOf = (outputs: readonly { readonly address: string }[]) =>
  Math.max(0, new Set(outputs.map((output) => output.address)).size - MAX_PAYS);

const indexOfOutRef = (outRef: string) =>
  Number(outRef.slice(outRef.indexOf("#") + 1));

/**
 * The transaction of `pool` an out ref names, when the out ref is one of its regular outputs:
 * never by its collateral return, which exists only when its scripts failed
 */
const regularIn = (
  outRef: string,
  pool: ReadonlyMap<string, LineTx>,
): LineTx | undefined => {
  const below = pool.get(hashOfOutRef(outRef));
  return below !== undefined &&
    below.outputs !== undefined &&
    indexOfOutRef(outRef) < below.outputs
    ? below
    : undefined;
};

const lowerOutRef = (outRef: string) => {
  const at = outRef.indexOf("#");
  return at < 0
    ? outRef
    : `${outRef.slice(0, at).toLowerCase()}${outRef.slice(at)}`;
};

/**
 * The transaction as the rule reads it. Of a step: its spent inputs, and every transaction whose
 * outputs it spends, reads or puts up; its end of validity, and the block it was found in once.
 * Of an entry: its spent out refs, and the transactions they come from
 */
export const lineTxOf = (tx: LineInput): LineTx => {
  if ("built" in tx) {
    const seen = (tx as Partial<Pick<StepRecord, "seen">>).seen;
    const until = stepUntil(tx);
    return {
      step: tx.name,
      txHash: tx.built.txHash.toLowerCase(),
      spends: tx.built.inputs.map((input) =>
        outRefKey(input.txHash, input.outputIndex),
      ),
      sources: sourcesOf(tx.built),
      refs: Array.from(
        new Set(
          [
            ...tx.built.inputs,
            ...(tx.built.referenceInputs ?? []),
            ...(tx.built.collateral?.inputs ?? []),
          ].map((utxo) => outRefKey(utxo.txHash, utxo.outputIndex)),
        ),
      ),
      ...(tx.built.outputs !== undefined && {
        outputs: tx.built.outputs.length,
      }),
      ...(tx.kind === "consolidation" && { consolidation: true as const }),
      ...(until !== undefined && { until }),
      ...(seen !== undefined && { seen }),
      ...((tx.built.redeemers?.length ?? 0) > 0 && { plutus: true as const }),
      ...(paysOf(tx.built.outputs ?? []).length > 0 && {
        pays: paysOf(tx.built.outputs ?? []),
      }),
      ...(paysMoreOf(tx.built.outputs ?? []) > 0 && {
        paysMore: paysMoreOf(tx.built.outputs ?? []),
      }),
    };
  }
  if ("sources" in tx) return tx;
  const spends = tx.spends.map(lowerOutRef);
  return {
    step: tx.step,
    txHash: tx.txHash.toLowerCase(),
    spends,
    sources: Array.from(new Set(spends.map(hashOfOutRef))),
    refs: spends,
    outputs: tx.outputs,
    ...(tx.until !== undefined && { until: tx.until }),
    ...((tx.seen ?? tx.seenBefore) !== undefined && {
      seen: (tx.seen ?? tx.seenBefore)!,
    }),
    ...(tx.plutus === true && { plutus: true as const }),
    ...(tx.pays !== undefined && { pays: tx.pays }),
    ...(tx.paysMore !== undefined && { paysMore: tx.paysMore }),
  };
};

/** The transactions by hash; the first of a hash given twice */
const byHash = (txs: readonly LineTx[]) => {
  const map = new Map<string, LineTx>();
  for (const tx of txs) if (!map.has(tx.txHash)) map.set(tx.txHash, tx);
  return map;
};

/**
 * The transaction and every transaction of `pool` it stands on by a regular output, all the way
 * down
 */
const closureOf = (tx: LineTx, pool: ReadonlyMap<string, LineTx>): LineTx[] => {
  const all = [tx];
  const met = new Set([tx.txHash]);
  for (let i = 0; i < all.length; i++)
    for (const ref of all[i]!.refs) {
      const below = regularIn(ref, pool);
      if (below === undefined || met.has(below.txHash)) continue;
      met.add(below.txHash);
      all.push(below);
    }
  return all;
};

/**
 * Whether a transaction of `a` and a transaction of `b` spend one out ref. A transaction never
 * excludes itself: the same hash on both sides is one transaction, not two
 */
const spendOne = (a: readonly LineTx[], b: readonly LineTx[]): boolean =>
  a.some((x) => {
    const spent = new Set(x.spends);
    return b.some(
      (y) => y.txHash !== x.txHash && y.spends.some((each) => spent.has(each)),
    );
  });

/**
 * The open transactions the rule reads: those whose hash no step of the new plan has. A step
 * that holds an open transaction byte for byte is that transaction, not a second one
 */
const openPool = (
  open: readonly LineTx[],
  made: ReadonlySet<string>,
): Map<string, LineTx> => byHash(open.filter((tx) => !made.has(tx.txHash)));

/**
 * Whether an open transaction cannot land: it, or one it stands on, is used up or spends what a
 * kept one spends
 */
const settledIn = (
  tx: LineTx,
  pool: ReadonlyMap<string, LineTx>,
  kept: readonly LineTx[],
) => {
  const below = closureOf(tx, pool);
  return below.some((each) => each.usedUp === true) || spendOne(kept, below);
};

/**
 * The open transactions that are settled: a kept transaction and one of {it, the open
 * transactions it stands on} spend one out ref, or one of those is used up, so it cannot land.
 * `made`: the hashes of the steps of the new plan; an open transaction one of them has is left
 * out
 */
export const settled = <O extends LineInput>(
  open: readonly O[],
  kept: readonly LineInput[],
  made: readonly string[] = [],
): O[] => {
  const lines = open.map(lineTxOf);
  const pool = openPool(lines, new Set(made.map((each) => each.toLowerCase())));
  const keptLines = kept.map(lineTxOf);
  return open.filter((_, i) => {
    const tx = lines[i]!;
    return pool.has(tx.txHash) && settledIn(tx, pool, keptLines);
  });
};

/**
 * The open transactions each step could land beside. For each of `steps` that is no
 * consolidation step and whose hash no open transaction has, the open transactions that are
 * neither kept apart from it nor settled; a step with none is not in the answer.
 *
 * A step and an open transaction are kept apart when a transaction of {the step, the steps of
 * its plan it stands on, among `steps` and `earlier`} and one of {the open transaction, the
 * open transactions it stands on} spend one out ref. Only spent inputs count: an output one of
 * them reads or puts up while the other spends it lets both land. Out refs are compared with the
 * hash in lower case. An open transaction whose hash a step has is left out on both sides.
 *
 * @param steps The steps built, made by a build or recorded: each is judged
 * @param open The open transactions of the line: recorded steps, entries of `before.open`, or
 *   what `lineClasses` gives (with `usedUp`)
 * @param kept The kept transactions of the line: its final steps and kept entries
 * @param earlier The steps of the same plan before `steps`, which they may stand on; never
 *   judged
 */
export const landsBeside = <T extends LineInput, O extends LineInput>(
  steps: readonly T[],
  open: readonly O[],
  kept: readonly LineInput[],
  earlier: readonly LineInput[] = [],
): { readonly step: T; readonly open: O[] }[] => {
  const made = steps.map(lineTxOf);
  const openLines = open.map(lineTxOf);
  const openHashes = new Set(openLines.map((tx) => tx.txHash));
  const pool = openPool(openLines, new Set(made.map((tx) => tx.txHash)));
  const keptLines = kept.map(lineTxOf);
  const ownPlan = byHash([...made, ...earlier.map(lineTxOf)]);
  const answer: { readonly step: T; readonly open: O[] }[] = [];
  made.forEach((step, i) => {
    if (step.consolidation === true || openHashes.has(step.txHash)) return;
    const mine = closureOf(step, ownPlan);
    const beside = open.filter((_, k) => {
      const tx = openLines[k]!;
      if (!pool.has(tx.txHash)) return false;
      const theirs = closureOf(tx, pool);
      return !spendOne(mine, theirs) && !settledIn(tx, pool, keptLines);
    });
    if (beside.length > 0) answer.push({ step: steps[i]!, open: beside });
  });
  return answer;
};

/* ---------------------------------------------------------------------------------------------
 * The classes of the line after a look
 * ------------------------------------------------------------------------------------------- */

/**
 * What a search answered about one transaction. `slot` absent on a find: the search did not
 * place it; `valid` absent: it did not say whether its scripts passed
 */
export type LookAnswer = {
  readonly txHash: string;
  readonly found: boolean;
  readonly slot?: number;
  readonly block?: string;
  readonly blockHeight?: number;
  readonly valid?: boolean;
};

/** The line of a plan, after a look */
export type LineClasses = {
  /** Kept: final steps, and entries found at the depth of final with scripts that passed */
  readonly kept: readonly LineTx[];
  /**
   * Open: every other transaction that is not unconfirmed, steps in their order then entries;
   * the used-up among them, and those dead after the look, are marked
   */
  readonly open: readonly LineTx[];
  /**
   * Taken: the steps of the plan that are `included` and that this look found in a block with
   * scripts that passed. A plan made in its place holds each as a step of its own
   */
  readonly taken: readonly LineTx[];
  /**
   * In a block and not final, where a new plan cannot hold it (a failed step, an entry), an
   * `included` step this look did not find so, or a find whose slot or depth is not known:
   * nothing is made until a later look
   */
  readonly unconfirmed: readonly LineTx[];
  /**
   * Found in a block, running a Plutus script, by a search that does not say whether its scripts
   * passed: a provider that does not report it can never tell
   */
  readonly noValidity: readonly LineTx[];
};

/** A find with the members a depth is worked out from */
const placed = (
  answer: LookAnswer | undefined,
): (LookAnswer & { found: true; slot: number }) | undefined =>
  answer?.found === true &&
  typeof answer.slot === "number" &&
  Number.isFinite(answer.slot)
    ? (answer as LookAnswer & { found: true; slot: number })
    : undefined;

/**
 * What a find of a failed step or of an entry makes of it. Of a transaction that runs no Plutus
 * script a find that does not say whether its scripts passed counts as one where they passed; of
 * one that runs a script it is `noValidity`. At the depth of final, kept when its scripts passed
 * and used up when they failed; found less deep, with no depth or without a slot: unconfirmed
 */
const byFind = (
  base: Pick<PlanRecord, "deadlines">,
  tx: LineTx,
  answer: LookAnswer,
  tip: PlanTip | undefined,
): "kept" | "usedUp" | "unconfirmed" | "noValidity" => {
  const find = placed(answer);
  if (find === undefined) return "unconfirmed";
  const valid = find.valid ?? (tx.plutus === true ? undefined : true);
  if (valid === undefined) return "noValidity";
  if (!atFinalDepth(base, tip, find)) return "unconfirmed";
  return valid ? "kept" : "usedUp";
};

/**
 * An open transaction this look calls expired: dead when no look ever found it in a block, else
 * gone, out of the blocks that held it
 */
const expiredOf = (tx: LineTx): LineTx =>
  tx.seen === undefined ? { ...tx, dead: true } : { ...tx, gone: true };

/**
 * The classes of a plan's line after a look: its steps and the entries of its `before.open`.
 *
 * - A `final` step is kept. An `included` one is taken when this look found it with a slot and
 *   scripts that passed (no word on them, for a step that runs no Plutus script), else
 *   unconfirmed; so is any other step a look answered was found.
 * - For a `failed` step and for an entry the look's answer decides: found at the depth of
 *   `final`, kept when its scripts passed and used up when they failed; found less deep, or with
 *   no depth: unconfirmed; not found: open. A find with no word on its scripts is one where they
 *   passed for a transaction that runs no Plutus script, and `noValidity` for one that runs one.
 *   With no answer a failed step is unconfirmed, and an entry is open.
 * - Every other step is open. The used-up are open too.
 * - Dead, among the open, with no `seen`: a step that is `expired` and that the look answered it
 *   did not find (no answer, as from a search that failed, is no such answer); an entry whose `until` plus
 *   the margin the tip and the clock have both passed (as a step expires), that the look did not
 *   find, while it found the transaction of one of its spent inputs in a block; and one that
 *   stands on a dead one. Gone: one of those two with `seen`, which a rollback took out of its
 *   block; never dead, as the chain may go back to that block.
 *
 * `base` is the record after the look; `answers` what its searches said; `tip` its tip, with the
 * local clock it was read by. A final plan is the caller's to refuse.
 */
export const lineClasses = (
  base: PlanRecord,
  answers: readonly LookAnswer[],
  tip: PlanTip | undefined,
): LineClasses => {
  const answerOf = new Map<string, LookAnswer>();
  for (const answer of answers)
    answerOf.set(answer.txHash.toLowerCase(), answer);
  const kept: LineTx[] = [];
  const open: LineTx[] = [];
  const unconfirmed: LineTx[] = [];
  const noValidity: LineTx[] = [];
  const taken: LineTx[] = [];
  const byAnswer = (tx: LineTx, answer: LookAnswer | undefined) => {
    if (answer?.found !== true) return open.push(tx);
    const outcome = byFind(base, tx, answer, tip);
    if (outcome === "kept") return kept.push(tx);
    if (outcome === "usedUp") return open.push({ ...tx, usedUp: true });
    if (outcome === "noValidity") return noValidity.push(tx);
    return unconfirmed.push(tx);
  };
  for (const step of base.steps) {
    const tx = lineTxOf(step);
    const answer = answerOf.get(tx.txHash);
    if (step.status === "final") {
      kept.push(tx);
    } else if (step.status === "failed") {
      if (answer === undefined) unconfirmed.push(tx);
      else byAnswer(tx, answer);
    } else if (step.status === "included") {
      // In a block by this look's own find: a step the new plan holds as it is
      const find = placed(answer);
      const valid =
        find === undefined
          ? false
          : (find.valid ?? (tx.plutus === true ? undefined : true));
      (valid === true ? taken : unconfirmed).push(tx);
    } else if (answer?.found === true) {
      unconfirmed.push(tx);
    } else {
      // Dead only by what this look answered: a search that failed or is not supported says
      // nothing, whatever the record says
      open.push(
        step.status === "expired" && answer?.found === false
          ? expiredOf(tx)
          : tx,
      );
    }
  }
  const margin = base.deadlines.expiryMarginMs;
  for (const entry of base.before?.open ?? []) {
    const tx = lineTxOf(entry);
    const answer = answerOf.get(tx.txHash);
    if (answer?.found === true) {
      byAnswer(tx, answer);
      continue;
    }
    // Dead by time, as a step expires: past its end and the margin, not found, and the search
    // knows the chain before it
    const expired =
      answer?.found === false &&
      tx.sources.some((source) => answerOf.get(source)?.found === true) &&
      pastMarginAt(tx.until, margin, tip);
    open.push(expired ? expiredOf(tx) : tx);
  }
  // And one with no `seen` that stands on a dead one
  const marked = [...open];
  const pool = byHash(marked);
  let changed = true;
  while (changed) {
    changed = false;
    marked.forEach((tx, i) => {
      if (tx.dead === true || tx.seen !== undefined || tx.usedUp === true)
        return;
      const deadBelow = tx.refs.some((ref) => {
        const below = regularIn(ref, pool);
        return below !== undefined && below !== tx && below.dead === true;
      });
      if (!deadBelow) return;
      marked[i] = { ...tx, dead: true };
      pool.set(tx.txHash, marked[i]!);
      changed = true;
    });
  }
  return { kept, open: marked, taken, unconfirmed, noValidity };
};

/**
 * The pairs `landsBeside` gives, less the open transactions that only a taken step keeps from
 * landing beside a step built, and the first of those with the first taken step that keeps it.
 *
 * An open transaction is held by a taken step when the kept steps and the taken steps together
 * settle it (it, or one it stands on, spends an out ref one of them spends), dead or not: once
 * that taken step is final it is settled, and the pair is gone. Until then it may land beside
 * the step built after a rollback that is not undone, also one called dead, which a rollback
 * deeper than the margin brings back: no judgement of time or of a shared input passes it, and
 * none refuses it for good. One that the kept steps settle is in no pair.
 *
 * @param pairs What `landsBeside` gave for these arguments
 * @param open The open transactions of the line, as `landsBeside` was given them
 * @param kept The kept transactions of the line, as `landsBeside` was given them
 * @param taken The steps of the plan in a block and not final, in its order: of `replan` the
 *   taken steps, of `add` the plan's `included` steps, taken or not
 * @param made The hashes of the steps judged, as `landsBeside` reads them
 * @returns the pairs without the held transactions, a pair with none left dropped; and the first
 *   held one, with the step built it is a pair of and the taken step, if any is held
 */
export const heldByTaken = <T extends LineInput>(
  pairs: readonly { readonly step: T; readonly open: readonly LineTx[] }[],
  open: readonly LineTx[],
  kept: readonly LineInput[],
  taken: readonly LineInput[],
  made: readonly string[],
): {
  readonly pairs: { readonly step: T; readonly open: LineTx[] }[];
  readonly held?: {
    readonly step: T;
    readonly open: LineTx;
    readonly taken: LineTx;
  };
} => {
  const byTaken = new Set(
    settled(open, [...kept, ...taken], made).map((tx) => tx.txHash),
  );
  const rest: { step: T; open: LineTx[] }[] = [];
  let held:
    | { readonly step: T; readonly open: LineTx; readonly taken: LineTx }
    | undefined;
  for (const pair of pairs) {
    const left: LineTx[] = [];
    for (const tx of pair.open) {
      // The first taken step that settles it with the kept steps alone; none: it stays judged
      const by = byTaken.has(tx.txHash)
        ? taken.find((one) =>
            settled(open, [...kept, one], made).some(
              (each) => each.txHash === tx.txHash,
            ),
          )
        : undefined;
      if (by === undefined) left.push(tx);
      else held ??= { step: pair.step, open: tx, taken: lineTxOf(by) };
    }
    if (left.length > 0) rest.push({ step: pair.step, open: left });
  }
  return { pairs: rest, ...(held !== undefined && { held }) };
};

/* ---------------------------------------------------------------------------------------------
 * Roots and the input they share with a new step
 * ------------------------------------------------------------------------------------------- */

/**
 * A step given to the new plan, as the choice of shared inputs reads it: one built from parts,
 * with the key of its payer's read; or one given built, by its body
 */
export type GuardStep =
  | {
      readonly name: string;
      /** The key the reads of `rootGuards` hold this step's payer's UTxOs under */
      readonly payer: string;
      readonly parts: readonly (TxPart | LinkedPart)[];
    }
  | { readonly name: string; readonly built: RuleBody };

/**
 * The out refs parts name: those they spend, read (reference inputs and reference scripts) or
 * put up as collateral, with the hash in lower case, each once; and those they spend. A link to
 * a step names no out ref
 */
export const outRefsOfParts = (
  parts: readonly (TxPart | LinkedPart)[],
): { readonly named: string[]; readonly spent: string[] } => {
  const named = new Set<string>();
  const spent = new Set<string>();
  for (const part of parts) {
    if (
      (part.kind === "spend" ||
        part.kind === "referenceInput" ||
        part.kind === "collateral") &&
      "input" in part
    ) {
      const key = outRefKey(part.input.transaction_id, part.input.index);
      named.add(key);
      if (part.kind === "spend") spent.add(key);
    }
    if (!("witness" in part)) continue;
    const { witness } = part;
    if (
      (witness.type === "native" || witness.type === "plutus") &&
      witness.script.type === "reference"
    )
      named.add(
        outRefKey(
          witness.script.input.transaction_id,
          witness.script.input.index,
        ),
      );
  }
  return { named: [...named], spent: [...spent] };
};

/** A root of the line, and the input of it a step of the new plan spends, when one is chosen */
export type RootGuard = {
  readonly root: LineTx;
  /** The UTxO, as the read holds it, and the step it goes into */
  readonly guard?: { readonly utxo: Utxo; readonly step: string };
};

/**
 * The roots of the open transactions and the input each shares with a step of the new plan.
 *
 * A root is an open transaction that stands on no other open transaction: the steps in their
 * order, then the entries, as `open` gives them. An open transaction a step given built holds
 * byte for byte is that step, and is left out. The guard of a root is the first of its spent
 * inputs, in the order of its body, that a read holds, that a payment key locks, and that no
 * part of another given step names, nor its own step other than by spending it (nor a step
 * given built). It goes into the first given step built from parts whose payer's read holds it;
 * a root with no such input gets none. The choice depends on the order of the roots' inputs and
 * of the steps alone, never on the order of the reads or of the UTxOs in them.
 *
 * @param open The open transactions, in the order above
 * @param reads Each payer's UTxOs as the call read them, under the key its steps name
 * @param steps The steps given, in their order
 * @returns The roots with their guards, and the parts to add: one `spend.pubKey({ utxo })` per
 *   out ref, to `step`, for each guard that step's parts do not spend already
 */
export const rootGuards = (
  open: readonly LineInput[],
  reads: ReadonlyMap<string, readonly Utxo[]>,
  steps: readonly GuardStep[],
): {
  readonly roots: readonly RootGuard[];
  readonly added: readonly { readonly step: string; readonly utxo: Utxo }[];
} => {
  const held = new Set(
    steps.flatMap((step) =>
      "built" in step ? [step.built.txHash.toLowerCase()] : [],
    ),
  );
  const lines = open.map(lineTxOf).filter((tx) => !held.has(tx.txHash));
  const pool = byHash(lines);
  const roots = lines.filter((tx) =>
    tx.refs.every((ref) => {
      const below = regularIn(ref, pool);
      return below === undefined || below.txHash === tx.txHash;
    }),
  );

  // Which steps name each out ref, and which each step spends
  const namedBy = new Map<string, Set<string>>();
  const spentBy = new Map<string, Set<string>>();
  const name = (outRef: string, step: string) => {
    const set = namedBy.get(outRef) ?? new Set<string>();
    set.add(step);
    namedBy.set(outRef, set);
  };
  for (const step of steps) {
    if ("built" in step) {
      const { built } = step;
      for (const utxo of [
        ...built.inputs,
        ...(built.referenceInputs ?? []),
        ...(built.collateral?.inputs ?? []),
      ])
        name(outRefKey(utxo.txHash, utxo.outputIndex), step.name);
      continue;
    }
    const { named, spent } = outRefsOfParts(step.parts);
    for (const outRef of named) name(outRef, step.name);
    spentBy.set(step.name, new Set(spent));
  }

  // Each payer's read by out ref
  const readOf = new Map<string, Map<string, Utxo>>();
  for (const [payer, utxos] of reads) {
    const map = new Map<string, Utxo>();
    for (const utxo of utxos)
      map.set(outRefKey(utxo.txHash, utxo.outputIndex), utxo);
    readOf.set(payer, map);
  }

  const chosen: RootGuard[] = [];
  const added: { step: string; utxo: Utxo }[] = [];
  for (const root of roots) {
    let guard: RootGuard["guard"];
    for (const outRef of root.spends) {
      const step = steps.find(
        (each) => !("built" in each) && readOf.get(each.payer)?.has(outRef),
      );
      if (step === undefined || "built" in step) continue;
      const utxo = readOf.get(step.payer)!.get(outRef)!;
      if (!isKeyLocked(utxo)) continue;
      const names = namedBy.get(outRef) ?? new Set<string>();
      const ownSpend = spentBy.get(step.name)?.has(outRef) === true;
      const free =
        [...names].every((each) => each === step.name) &&
        (!names.has(step.name) || ownSpend);
      if (!free) continue;
      guard = { utxo, step: step.name };
      if (
        !ownSpend &&
        !added.some(
          (each) =>
            outRefKey(each.utxo.txHash, each.utxo.outputIndex) === outRef,
        )
      )
        added.push({ step: step.name, utxo });
      break;
    }
    chosen.push({ root, ...(guard !== undefined && { guard }) });
  }
  return { roots: chosen, added };
};

/* ---------------------------------------------------------------------------------------------
 * What the new record keeps
 * ------------------------------------------------------------------------------------------- */

/**
 * What a plan made in place of `base` keeps of its line. `final`: the names `base` keeps, then
 * those of its kept steps and kept entries, each once. `open`: every open transaction that is
 * not settled and whose hash no step made has, with its name, hash and spent out refs, and its
 * end of validity unless it was found in a block once: time never settles it then.
 *
 * @param base The record after the look
 * @param classes What `lineClasses` made of it; none unconfirmed
 * @param made The hashes of the steps of the new plan
 */
export const beforeOf = (
  base: PlanRecord,
  classes: Pick<LineClasses, "kept" | "open">,
  made: readonly string[],
): PlanBefore => {
  const final: string[] = [];
  for (const name of [
    ...(base.before?.final ?? []),
    ...classes.kept.map((tx) => tx.step),
  ])
    if (!final.includes(name)) final.push(name);
  const hashes = new Set(made.map((each) => each.toLowerCase()));
  const cannotLand = new Set(settled(classes.open, classes.kept, made));
  const open: BeforeEntry[] = classes.open
    .filter((tx) => !hashes.has(tx.txHash) && !cannotLand.has(tx))
    .map((tx) => ({
      step: tx.step,
      txHash: tx.txHash,
      spends: [...tx.spends],
      // Not known: no output of it stands for one it made
      outputs: tx.outputs ?? 0,
      ...(tx.seen === undefined &&
        tx.until !== undefined && { until: tx.until }),
      ...(tx.seen !== undefined && { seenBefore: tx.seen }),
      ...(tx.plutus === true && { plutus: true as const }),
      ...(tx.pays !== undefined &&
        tx.pays.length > 0 && { pays: [...tx.pays] }),
      // The addresses `pays` could not keep, told by their number
      ...(tx.pays !== undefined &&
        tx.pays.length > 0 &&
        tx.paysMore !== undefined && { paysMore: tx.paysMore }),
    }));
  return { final, open };
};

/* ---------------------------------------------------------------------------------------------
 * What a plan made in place of another builds, and what it may not stand on
 * ------------------------------------------------------------------------------------------- */

/**
 * The names a plan made in place of `base` never builds again: the names `base` keeps of the
 * plans before it, and those of its kept steps and kept entries
 */
export const keptNamesOf = (
  base: Pick<PlanRecord, "before">,
  classes: Pick<LineClasses, "kept">,
): ReadonlySet<string> =>
  new Set([
    ...(base.before?.final ?? []),
    ...classes.kept.map((tx) => tx.step),
  ]);

/**
 * The steps of `base` a plan made in its place builds when it is given none: each that is open,
 * not failed, of no kept name; consolidation steps among them, which the caller leaves out
 */
export const leftOf = (
  base: Pick<PlanRecord, "steps" | "before">,
  classes: Pick<LineClasses, "kept" | "open">,
): StepRecord[] => {
  const open = new Set(classes.open.map((tx) => tx.txHash));
  const kept = keptNamesOf(base, classes);
  return base.steps.filter(
    (step) =>
      open.has(step.txHash.toLowerCase()) &&
      step.status !== "failed" &&
      !kept.has(step.name),
  );
};

/** The first transaction of `after` that is an open transaction of the line, when one is */
export const openAmong = (
  after: readonly Pick<BuiltTxData, "txHash">[],
  open: readonly LineTx[],
): Pick<BuiltTxData, "txHash"> | undefined => {
  const hashes = new Set(open.map((tx) => tx.txHash));
  return after.find((tx) => hashes.has(tx.txHash.toLowerCase()));
};

/**
 * The first step built that spends, reads or puts up an output of an open transaction of the
 * line whose hash no step built has, with that transaction: the search does not find it in a
 * block. A used-up transaction is in a block for good, its collateral return with it
 */
export const standingOn = <T extends { readonly built: RuleBody }>(
  steps: readonly T[],
  open: readonly LineTx[],
): { readonly step: T; readonly below: LineTx } | undefined => {
  const made = new Set(steps.map((step) => step.built.txHash.toLowerCase()));
  const standing = new Map(
    open
      .filter((tx) => !made.has(tx.txHash) && tx.usedUp !== true)
      .map((tx) => [tx.txHash, tx]),
  );
  for (const step of steps)
    for (const hash of sourcesOf(step.built)) {
      const below = standing.get(hash);
      if (below !== undefined) return { step, below };
    }
  return undefined;
};
