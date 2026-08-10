/**
 * tagRanges.ts
 *
 * The vocabulary the HTML and JSX context scanners share: a span covering one
 * opening tag's attribute region, the "is this offset inside one?" test, and
 * the per-document-version cache both scans are held in.
 *
 * The scans themselves are deliberately not shared. Both answer the same
 * question — where in this document can an Alpine attribute appear? — but `<`
 * means different things in the two families, so they reach the answer
 * differently. See the header comments in htmlContext.ts and jsxContext.ts.
 */

/** Half-open `[start, end)` span covering one opening tag's attribute region. */
export interface TagRange {
	start: number;
	end: number;
}

/** True when `offset` falls inside one of the given tag ranges. */
export function isInRanges(ranges: TagRange[], offset: number): boolean {
	for (const range of ranges) {
		if (offset > range.start && offset <= range.end) { return true; }
	}
	return false;
}

/**
 * Largest document a scanner will walk. Past this the extension goes inert
 * rather than scanning a multi-megabyte bundle. Relevant because `javascript`
 * is a supported language, so minified `.js` files are in scope.
 */
const MAX_SCANNED_LENGTH = 2_000_000;

/**
 * Wraps `scan` in a one-entry cache keyed by document identity and version.
 *
 * Several providers ask about the same document on the same keystroke — hover,
 * the dot completions, the directive-name completions and the diagnostic pass
 * all need the ranges. Each scan is linear, but running it three or four times
 * per keystroke on a large file is not, so the result is held until the
 * document changes.
 *
 * Each call to this factory gets its own slot, so the scans in play (JSX, HTML,
 * and HTML including commented-out markup) can't evict one another — they are
 * different answers for the same document at the same version.
 *
 * `getText` is a callback rather than a string so that a cache hit doesn't pay
 * for materialising the document text it isn't going to read.
 */
export function createRangeCache(
	scan: (text: string) => TagRange[],
): (key: string, version: number, getText: () => string) => TagRange[] {
	let cacheKey: string | undefined;
	let cacheVersion = -1;
	let cacheRanges: TagRange[] = [];

	return (key, version, getText) => {
		if (key === cacheKey && version === cacheVersion) { return cacheRanges; }
		const text = getText();
		cacheKey = key;
		cacheVersion = version;
		cacheRanges = text.length > MAX_SCANNED_LENGTH ? [] : scan(text);
		return cacheRanges;
	};
}
