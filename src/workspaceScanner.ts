/**
 * workspaceScanner.ts
 *
 * Scans workspace source files for Alpine.data() / Alpine.store() registrations and
 * the current document for x-ref declarations and x-data property names.
 *
 * Results are cached in-memory and invalidated by a VS Code file-system
 * watcher. The initial scan is non-blocking — providers return whatever is
 * cached at call time.
 */

import * as vscode from 'vscode';

// ─── Scan targets ─────────────────────────────────────────────────────────────

/**
 * File extensions searched for `Alpine.data()` / `Alpine.store()` calls.
 *
 * Single source of truth for both the initial `findFiles` sweep and the
 * file-system watcher — they previously kept separate literal lists that had
 * to be edited in lockstep.
 */
const SCAN_EXTENSIONS = [
	'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
	'html', 'liquid', 'jinja', 'jinja2', 'j2', 'astro',
] as const;

/**
 * Per-extension cap on the initial sweep. `findFiles` truncates silently, and
 * a truncated sweep shows up as `$store` completions and go-to-definition just
 * quietly not working, so the cap is generous rather than tight. Applied per
 * extension, not in total.
 */
const MAX_FILES_PER_EXTENSION = 2000;

/** True for files under a `node_modules` directory. */
function isExcluded(uri: vscode.Uri): boolean {
	return uri.path.includes('/node_modules/');
}

// ─── Regexes ──────────────────────────────────────────────────────────────────

const ALPINE_STORE_RE = /Alpine\.store\s*\(\s*['"](\w+)['"]/g;
// The optional `{` covers JSX's expression-container form, `x-ref={"name"}`
// and `x-data={"{ open: false }"}`. A container holding a real object
// (`x-data={{ open: false }}`) is deliberately not matched: Alpine reads the
// attribute as a string, so that form renders `[object Object]` and is a bug
// rather than a syntax to support.
const XREF_ATTR_RE = /x-ref=\{?\s*["'](\w+)["']/g;
const XDATA_ATTR_RE = /x-data=\{?\s*(?:"([^"]*)"|'([^']*)')/g;

// ─── In-memory cache ──────────────────────────────────────────────────────────

/** Source location of an `Alpine.data('name', ...)` call. */
export interface DataLocation {
	name: string;
	line: number;
	char: number;
}

interface CacheEntry {
	dataLocations: DataLocation[];
	storeNames: string[];
}

const fileCache = new Map<string, CacheEntry>();

// ─── Internal helpers ─────────────────────────────────────────────────────────

function extractMatches(text: string, re: RegExp): string[] {
	const names: string[] = [];
	re.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		names.push(m[1]);
	}
	return [...new Set(names)];
}

/**
 * Extracts `Alpine.data('name', ...)` calls together with their source
 * positions so that a DefinitionProvider can jump to the registration site.
 */
function extractDataLocations(text: string): DataLocation[] {
	const locs: DataLocation[] = [];
	const re = /Alpine\.data\s*\(\s*['"](\w+)['"]/g;
	let m: RegExpExecArray | null;
	let prevIndex = 0;
	let line = 0;
	let lineStart = 0;
	while ((m = re.exec(text)) !== null) {
		// Advance line/char counters from previous match position to current
		for (let i = prevIndex; i < m.index; i++) {
			if (text[i] === '\n') {
				line++;
				lineStart = i + 1;
			}
		}
		prevIndex = m.index;
		locs.push({ name: m[1], line, char: m.index - lineStart });
	}
	return locs;
}

async function scanFile(uri: vscode.Uri): Promise<void> {
	try {
		const bytes = await vscode.workspace.fs.readFile(uri);
		const text = Buffer.from(bytes).toString('utf8');
		const dataLocations = extractDataLocations(text);
		const storeNames = extractMatches(text, ALPINE_STORE_RE);
		fileCache.set(uri.toString(), { dataLocations, storeNames });
	} catch {
		fileCache.delete(uri.toString());
	}
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** All `Alpine.data('name', ...)` registration names found in the workspace. */
export function getAlpineDataNames(): string[] {
	const all = new Set<string>();
	for (const entry of fileCache.values()) {
		for (const loc of entry.dataLocations) {
			all.add(loc.name);
		}
	}
	return [...all].sort();
}

/**
 * All source locations where `Alpine.data('name', ...)` is called for the
 * given component name. Used by the DefinitionProvider.
 */
export function getAlpineDataLocations(name: string): vscode.Location[] {
	const locs: vscode.Location[] = [];
	for (const [uriStr, entry] of fileCache.entries()) {
		for (const loc of entry.dataLocations) {
			if (loc.name === name) {
				locs.push(
					new vscode.Location(
						vscode.Uri.parse(uriStr),
						new vscode.Position(loc.line, loc.char),
					),
				);
			}
		}
	}
	return locs;
}

/** All `Alpine.store('name', ...)` registration names found in the workspace. */
export function getAlpineStoreNames(): string[] {
	const all = new Set<string>();
	for (const entry of fileCache.values()) {
		for (const name of entry.storeNames) {
			all.add(name);
		}
	}
	return [...all].sort();
}

/** All `x-ref="name"` values declared in the given document text. */
export function getXRefNames(documentText: string): string[] {
	return extractMatches(documentText, XREF_ATTR_RE);
}

/**
 * Heuristically extracts the top-level property names from the nearest
 * `x-data` attribute value that appears before `cursorOffset`.
 *
 * Works for simple inline object literals — e.g. `x-data="{ open: false,
 * count: 0 }"`. Returns an empty array if no x-data object can be found.
 */
export function getXDataProps(documentText: string, cursorOffset: number): string[] {
	const searchText = documentText.slice(0, cursorOffset);
	XDATA_ATTR_RE.lastIndex = 0;

	let lastValue: string | undefined;
	let m: RegExpExecArray | null;
	while ((m = XDATA_ATTR_RE.exec(searchText)) !== null) {
		// Group 1 = double-quoted value, group 2 = single-quoted value
		lastValue = m[1] ?? m[2];
	}
	if (!lastValue) { return []; }

	// Extract top-level keys: match patterns like `prop:` or `'prop':` or `"prop":`
	const keyRe = /(?:^|[,{])\s*['"]?(\w+)['"]?\s*:/g;
	const props: string[] = [];
	let km: RegExpExecArray | null;
	while ((km = keyRe.exec(lastValue)) !== null) {
		// Skip Alpine's reserved `init` shorthand
		if (km[1] !== 'init') {
			props.push(km[1]);
		}
	}
	return [...new Set(props)];
}

/**
 * Sets up the initial workspace scan and file-system watcher.
 * Call once from `activate()`.
 */
export async function initWorkspaceScanner(
	context: vscode.ExtensionContext,
): Promise<void> {
	const exclude = '**/node_modules/**';
	const uriLists = await Promise.all(
		SCAN_EXTENSIONS.map(ext =>
			vscode.workspace.findFiles(`**/*.${ext}`, exclude, MAX_FILES_PER_EXTENSION),
		),
	);
	await Promise.all(uriLists.flat().map(scanFile));

	// `findFiles` truncates at the cap without saying so, and a truncated scan
	// is invisible from the outside: `$store` completions and go-to-definition
	// simply come up empty for registrations in the files that were skipped.
	// Say so somewhere the user can find it.
	const truncated = SCAN_EXTENSIONS.filter(
		(_, i) => uriLists[i].length >= MAX_FILES_PER_EXTENSION,
	);
	if (truncated.length > 0) {
		const output = vscode.window.createOutputChannel('Alpine.js Tools');
		context.subscriptions.push(output);
		output.appendLine(
			`Workspace scan hit the ${MAX_FILES_PER_EXTENSION}-file limit for: ` +
			`${truncated.map(e => `*.${e}`).join(', ')}.`,
		);
		output.appendLine(
			'Alpine.data() and Alpine.store() registrations in the files beyond ' +
			'that limit will not appear in completions or go-to-definition.',
		);
	}

	// Re-scan on create/change; evict on delete.
	// `createFileSystemWatcher` takes no exclude pattern, so node_modules has
	// to be filtered here — otherwise every `npm install` re-scans thousands
	// of dependency files that `findFiles` above deliberately skipped.
	const watcher = vscode.workspace.createFileSystemWatcher(
		`**/*.{${SCAN_EXTENSIONS.join(',')}}`,
	);
	watcher.onDidChange(uri => { if (!isExcluded(uri)) { void scanFile(uri); } });
	watcher.onDidCreate(uri => { if (!isExcluded(uri)) { void scanFile(uri); } });
	watcher.onDidDelete(uri => { fileCache.delete(uri.toString()); });

	context.subscriptions.push(watcher);
}
