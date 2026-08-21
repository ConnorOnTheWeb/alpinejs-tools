/**
 * workspaceScanner.ts
 *
 * Scans workspace source files for Alpine.data() / Alpine.store() registrations and
 * the current document for x-ref declarations and x-data property names.
 *
 * Results are cached in-memory and invalidated by a VS Code file-system
 * watcher. The initial scan is non-blocking — providers return whatever is
 * cached at call time.
 *
 * The sweep can be repeated on demand (`rescanWorkspace`, wired to the
 * "Rescan Workspace" command). Only the sweep repeats: the file-system watcher
 * and the output channel are created once, by `initWorkspaceScanner`, because
 * registering either of them per rescan would leak a duplicate on every
 * invocation.
 */

import * as vscode from 'vscode';
import { CONFIG_SECTION, workspaceScanExclude } from './config';

// ─── Scan targets ─────────────────────────────────────────────────────────────

/**
 * File extensions searched for `Alpine.data()` / `Alpine.store()` calls.
 *
 * Single source of truth for both the initial `findFiles` sweep and the
 * file-system watcher — they previously kept separate literal lists that had
 * to be edited in lockstep.
 *
 * The Go template extensions are here for registrations written in an inline
 * `<script>` block, which is where a Go project without a JavaScript build
 * step tends to put them. `.tpl` is deliberately left out: Helm charts use it
 * heavily for `_helpers.tpl` partials that never contain Alpine, and each
 * entry costs its own `findFiles` sweep.
 */
const SCAN_EXTENSIONS = [
	'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
	'html', 'liquid', 'jinja', 'jinja2', 'j2', 'astro',
	'templ', 'gohtml', 'gotmpl', 'tmpl',
] as const;

/**
 * Per-extension cap on the initial sweep. `findFiles` truncates silently, and
 * a truncated sweep shows up as `$store` completions and go-to-definition just
 * quietly not working, so the cap is generous rather than tight. Applied per
 * extension, not in total.
 */
const MAX_FILES_PER_EXTENSION = 2000;

/** Always excluded, whatever the user configures. */
const NODE_MODULES_GLOB = '**/node_modules/**';

/**
 * The exclude pattern for `findFiles`: `node_modules` plus anything the user
 * added. A brace group is only built when there is something to add, so the
 * unconfigured case passes the exact same pattern as before.
 */
function buildExcludeGlob(): string {
	const extra = workspaceScanExclude();
	if (extra.length === 0) { return NODE_MODULES_GLOB; }
	return `{${[NODE_MODULES_GLOB, ...extra].join(',')}}`;
}

/**
 * Translates a glob to an anchored RegExp.
 *
 * `findFiles` gets the real VS Code glob engine; the watcher has no such API
 * and needs to answer the same question about one URI at a time, which is what
 * this is for. It covers the forms that matter for excluding build output —
 * `**` (any depth), `*` (within one segment) and `?` — and not brace
 * alternation or character classes.
 *
 * Getting this wrong is benign in one direction only, and that is the
 * direction it errs: a pattern it fails to understand means the watcher
 * re-scans a file the initial sweep skipped, so the cache holds a little more
 * than asked. It can never drop a file the sweep included.
 */
function globToRegExp(glob: string): RegExp {
	let out = '';
	for (let i = 0; i < glob.length; i++) {
		const c = glob[i];
		if (c === '*' && glob[i + 1] === '*') {
			i++;
			// `**/` matches any number of leading segments *including none*, so
			// `**/dist/**` also matches a top-level `dist/app.js`.
			if (glob[i + 1] === '/') { i++; out += '(?:.*/)?'; }
			else { out += '.*'; }
		} else if (c === '*') {
			out += '[^/]*';
		} else if (c === '?') {
			out += '[^/]';
		} else {
			out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		}
	}
	return new RegExp(`^${out}$`);
}

/** Compiled form of the current exclude globs, rebuilt when the setting changes. */
let excludeMatchers: { key: string; patterns: RegExp[] } = { key: '', patterns: [] };

function excludePatterns(): RegExp[] {
	const globs = workspaceScanExclude();
	const key = globs.join('\n');
	if (excludeMatchers.key !== key) {
		excludeMatchers = { key, patterns: globs.map(globToRegExp) };
	}
	return excludeMatchers.patterns;
}

/**
 * True for files the sweep would not have collected — under `node_modules`, or
 * matching a configured exclude. Used by the watcher, which takes no exclude
 * pattern of its own.
 */
function isExcluded(uri: vscode.Uri): boolean {
	if (uri.path.includes('/node_modules/')) { return true; }
	const patterns = excludePatterns();
	if (patterns.length === 0) { return false; }
	const relative = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');
	return patterns.some(re => re.test(relative));
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

/**
 * Reassigned wholesale by a rescan rather than cleared and refilled, so that
 * completions and go-to-definition keep answering from the previous results
 * for the duration of the sweep instead of going empty part-way through it.
 */
let fileCache = new Map<string, CacheEntry>();

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

/**
 * Reads one file and records its registrations in `target`.
 *
 * The target is explicit because a rescan fills a fresh map while the watcher
 * keeps writing to the live one.
 */
async function scanFile(
	uri: vscode.Uri,
	target: Map<string, CacheEntry>,
): Promise<void> {
	try {
		const bytes = await vscode.workspace.fs.readFile(uri);
		const text = Buffer.from(bytes).toString('utf8');
		const dataLocations = extractDataLocations(text);
		const storeNames = extractMatches(text, ALPINE_STORE_RE);
		target.set(uri.toString(), { dataLocations, storeNames });
	} catch {
		target.delete(uri.toString());
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

// ─── Scanning ─────────────────────────────────────────────────────────────────

/** What one sweep found, so a caller can report it. */
export interface ScanSummary {
	/** Files collected across all extensions (before de-duplication). */
	fileCount: number;
	/** Extensions that hit the cap, as `*.js`-style labels. Empty if none did. */
	truncated: string[];
}

/** Created once, by `initWorkspaceScanner`, and reused by every rescan. */
let outputChannel: vscode.OutputChannel | undefined;

/** In-progress sweep, so overlapping rescans share one pass instead of racing. */
let inFlight: Promise<ScanSummary> | undefined;

async function runScan(): Promise<ScanSummary> {
	const exclude = buildExcludeGlob();
	const uriLists = await Promise.all(
		SCAN_EXTENSIONS.map(ext =>
			vscode.workspace.findFiles(`**/*.${ext}`, exclude, MAX_FILES_PER_EXTENSION),
		),
	);

	const next = new Map<string, CacheEntry>();
	await Promise.all(uriLists.flat().map(uri => scanFile(uri, next)));
	fileCache = next;

	return {
		fileCount: uriLists.reduce((total, list) => total + list.length, 0),
		// `findFiles` truncates at the cap without saying so, and a truncated
		// scan is invisible from the outside: `$store` completions and
		// go-to-definition simply come up empty for registrations in the files
		// that were skipped.
		truncated: SCAN_EXTENSIONS
			.filter((_, i) => uriLists[i].length >= MAX_FILES_PER_EXTENSION)
			.map(ext => `*.${ext}`),
	};
}

function scanOnce(): Promise<ScanSummary> {
	if (!inFlight) {
		inFlight = runScan().finally(() => { inFlight = undefined; });
	}
	return inFlight;
}

function logTruncation(summary: ScanSummary): void {
	if (summary.truncated.length === 0 || !outputChannel) { return; }
	outputChannel.appendLine(
		`Workspace scan hit the ${MAX_FILES_PER_EXTENSION}-file limit for: ` +
		`${summary.truncated.join(', ')}.`,
	);
	outputChannel.appendLine(
		'Alpine.data() and Alpine.store() registrations in the files beyond ' +
		'that limit will not appear in completions or go-to-definition.',
	);
	outputChannel.appendLine(
		'Add build output and vendored code to alpinejsTools.workspaceScan.exclude ' +
		'to bring the count under the limit.',
	);
}

/**
 * Sets up the initial workspace scan and file-system watcher.
 * Call once from `activate()`.
 */
export async function initWorkspaceScanner(
	context: vscode.ExtensionContext,
): Promise<void> {
	// Created up front rather than on first truncation so that the rescan
	// command always has somewhere to write, and so it is disposed with the
	// extension exactly once.
	outputChannel = vscode.window.createOutputChannel('Alpine.js Tools');
	context.subscriptions.push(outputChannel);

	const summary = await scanOnce();
	logTruncation(summary);

	// Re-scan on create/change; evict on delete.
	// `createFileSystemWatcher` takes no exclude pattern, so exclusions have to
	// be filtered here — otherwise every `npm install` re-scans thousands of
	// dependency files that `findFiles` above deliberately skipped.
	const watcher = vscode.workspace.createFileSystemWatcher(
		`**/*.{${SCAN_EXTENSIONS.join(',')}}`,
	);
	watcher.onDidChange(uri => { if (!isExcluded(uri)) { void scanFile(uri, fileCache); } });
	watcher.onDidCreate(uri => { if (!isExcluded(uri)) { void scanFile(uri, fileCache); } });
	watcher.onDidDelete(uri => { fileCache.delete(uri.toString()); });

	context.subscriptions.push(
		watcher,
		// Changing the exclude list changes which files the sweep would have
		// collected, so redo it. Scoped to that one setting — a diagnostic
		// severity change has no bearing on the scan and must not trigger one.
		vscode.workspace.onDidChangeConfiguration(event => {
			if (!event.affectsConfiguration(`${CONFIG_SECTION}.workspaceScan.exclude`)) {
				return;
			}
			void rescanWorkspace();
		}),
	);
}

/**
 * Re-runs the workspace sweep and returns what it found.
 *
 * The watcher keeps the cache current for edits made inside VS Code, so this
 * is for the cases it doesn't see: a scan that truncated and has since had
 * exclusions configured, a branch switched or dependencies installed outside
 * the editor, or a workspace that was still indexing when the first sweep ran.
 */
export async function rescanWorkspace(): Promise<ScanSummary> {
	const summary = await scanOnce();
	logTruncation(summary);
	return summary;
}

/** The output channel, for callers that want to show scan results. */
export function getOutputChannel(): vscode.OutputChannel | undefined {
	return outputChannel;
}
