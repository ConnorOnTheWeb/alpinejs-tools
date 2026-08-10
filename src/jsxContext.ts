/**
 * jsxContext.ts
 *
 * Structural "am I inside a JSX opening tag?" analysis for `.jsx` / `.tsx`
 * documents.
 *
 * Why this exists
 * ───────────────
 * In an HTML-family document a tolerant scan does the job (htmlContext.ts):
 * almost every `<` in the file really is a tag opener, so the scanner skips
 * what markup says to skip and otherwise keeps looking for the `>`.
 * In a JSX document that approach is useless: `<` is also the less-than
 * operator (`if (a < b)`) and the generic-argument delimiter
 * (`new Map<string, number>()`), and `=>` supplies stray `>` characters
 * everywhere. Applied to a `.tsx` file it reports "inside a tag" for large
 * stretches of ordinary TypeScript.
 *
 * That matters because every Alpine provider needs the answer, and a wrong
 * "yes" in plain TypeScript is a user-visible false positive. Without gating,
 * `const diff = x-y > 0` is reported as an unknown `x-y` directive, and
 * `{ 'color':theme.primary }` hovers as Alpine's `:` shorthand.
 *
 * How it works
 * ────────────
 * `findJsxTagRanges` walks the document once, skipping over comments and
 * string/template literals, and for each `<` attempts to parse a JSX opening
 * tag: an element name followed by a region containing only things that can
 * legally appear between a tag name and its `>` — whitespace, attribute-name
 * characters, `=`, quoted strings, and balanced `{…}` expression containers.
 * Anything else (`&`, `|`, `?`, `(`, `,`, `;`, a stray `<`, …) proves the `<`
 * was an operator, and the candidate is discarded.
 *
 * It returns the *attribute region* of each opening tag — from just after the
 * element name up to the `>` — which is exactly the span in which Alpine
 * directives can appear.
 */

import { createRangeCache, isInRanges, type TagRange } from './tagRanges';

/** First character of a JSX element name. */
const NAME_START_RE = /[A-Za-z_$]/;
/** Subsequent characters of a JSX element name (`Foo.Bar`, `svg:use`). */
const NAME_CHAR_RE = /[\w$.:-]/;
/** Characters legal inside an attribute name (`x-on:click.prevent`). */
const ATTR_NAME_CHAR_RE = /[\w$@:.-]/;

/**
 * Upper bound on how far the attribute scan will run before giving up.
 * A real opening tag's attribute region is never this long; the cap stops a
 * pathological `<` from making the scanner walk the rest of the file.
 */
const MAX_ATTR_REGION = 4000;

/**
 * Skips a string or template literal starting at `i` (which must be the
 * opening quote). Returns the index just past the closing quote.
 *
 * Single- and double-quoted strings terminate at an unescaped newline as well
 * as at the closing quote, so an unterminated one can't swallow the file.
 * Template literals recurse through `${…}` so a backtick inside an
 * interpolation doesn't end the literal early.
 */
function skipString(text: string, i: number): number {
	const quote = text[i];
	let j = i + 1;
	while (j < text.length) {
		const c = text[j];
		if (c === '\\') { j += 2; continue; }
		if (c === quote) { return j + 1; }
		if (quote === '`' && c === '$' && text[j + 1] === '{') {
			j = skipBraces(text, j + 1);
			continue;
		}
		if (quote !== '`' && c === '\n') { return j; }
		j++;
	}
	return text.length;
}

/**
 * Skips a balanced `{…}` group starting at `i` (which must be the opening
 * brace), stepping over any strings inside it. Returns the index just past
 * the matching closing brace.
 */
function skipBraces(text: string, i: number): number {
	let depth = 0;
	let j = i;
	while (j < text.length) {
		const c = text[j];
		if (c === '"' || c === "'" || c === '`') { j = skipString(text, j); continue; }
		if (c === '{') { depth++; j++; continue; }
		if (c === '}') {
			depth--;
			j++;
			if (depth === 0) { return j; }
			continue;
		}
		j++;
	}
	return text.length;
}

/**
 * Attempts to parse a JSX opening tag whose `<` is at `lt`.
 * Returns its attribute region, or `null` if this `<` isn't a tag.
 *
 * An unterminated region (no `>` before end-of-text or the length cap) is
 * still reported as a range extending to the end of the text. That case is
 * what the user is in the middle of while typing `<div x-`, and completions
 * have to work there. It can only be reached through a run of characters that
 * are all legal inside a tag, so ordinary TypeScript never lands in it.
 */
function scanJsxOpenTag(text: string, lt: number): TagRange | null {
	let i = lt + 1;
	if (i >= text.length || !NAME_START_RE.test(text[i])) { return null; }
	while (i < text.length && NAME_CHAR_RE.test(text[i])) { i++; }

	const start = i;
	const limit = Math.min(text.length, start + MAX_ATTR_REGION);
	let blankLine = false;

	while (i < limit) {
		const c = text[i];
		if (c === '"' || c === "'" || c === '`') { i = skipString(text, i); continue; }
		if (c === '{') { i = skipBraces(text, i); continue; }
		if (c === '>') { return { start, end: i }; }
		if (c === '/' && text[i + 1] === '>') { return { start, end: i }; }
		// A second `<` outside braces/strings means the first one was an
		// operator, not a tag opener.
		if (c === '<') { return null; }
		if (c === '\n') {
			// A blank line inside a tag's attribute region doesn't happen in
			// real JSX, but does happen between two `<` operators in code.
			if (blankLine) { return null; }
			blankLine = true;
			i++;
			continue;
		}
		if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
		blankLine = false;
		if (c === '=' || ATTR_NAME_CHAR_RE.test(c)) { i++; continue; }
		return null;
	}

	// Ran past the cap without closing — treat as a tag only if we stopped at
	// end-of-text (the "still typing" case), not at the length cap.
	return limit === text.length ? { start, end: text.length } : null;
}

/**
 * Attribute regions of every JSX opening tag in `text`, in source order.
 */
export function findJsxTagRanges(text: string): TagRange[] {
	const ranges: TagRange[] = [];
	let i = 0;
	while (i < text.length) {
		const c = text[i];
		if (c === '/' && text[i + 1] === '/') {
			const nl = text.indexOf('\n', i);
			i = nl === -1 ? text.length : nl + 1;
			continue;
		}
		if (c === '/' && text[i + 1] === '*') {
			const close = text.indexOf('*/', i + 2);
			i = close === -1 ? text.length : close + 2;
			continue;
		}
		if (c === '"' || c === "'" || c === '`') { i = skipString(text, i); continue; }
		if (c === '<') {
			const tag = scanJsxOpenTag(text, i);
			if (tag) {
				ranges.push(tag);
				// Resume just inside the attribute region rather than past the
				// tag, so nested JSX in `{…}` containers is still found. The
				// main loop skips the region's strings and braces on its own.
				i = tag.start;
				continue;
			}
		}
		i++;
	}
	return ranges;
}

/**
 * Tag ranges for a document, reusing the previous scan when the document
 * hasn't changed. `key` should identify the document (its URI) and `version`
 * should increment on edit (`TextDocument.version`).
 */
export const getJsxTagRanges = createRangeCache(findJsxTagRanges);

/** True when `offset` falls inside some JSX opening tag's attribute region. */
export function isInsideJsxTag(text: string, offset: number): boolean {
	return isInRanges(findJsxTagRanges(text), offset);
}

/**
 * Matches an Alpine directive whose value is open at the end of `linePrefix`.
 *
 * Covers the plain JSX string form (`x-text="…`, `x-text='…`) and the
 * expression-container form with a string literal inside it (`x-text={"…`,
 * `` x-text={`… ``). A bare container (`x-data={cart}`) holds real TypeScript
 * that the TS language service already completes, so it is deliberately not
 * matched here.
 *
 * Capture groups: 1 = directive name, 2 = quote character, 3 = value typed so far.
 */
export const JSX_DIRECTIVE_VALUE_RE =
	/(x-[\w-]+(?::[\w:-]+)?)\s*=\s*(?:\{\s*)?(["'`])([^"'`]*)$/;
