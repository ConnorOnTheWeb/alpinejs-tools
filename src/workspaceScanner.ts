/**
 * workspaceScanner.ts
 *
 * Scans workspace files for Alpine.data() / Alpine.store() registrations and
 * the current document for x-ref declarations and x-data property names.
 *
 * Results are cached in-memory and invalidated by a VS Code file-system
 * watcher. The initial scan is non-blocking — providers return whatever is
 * cached at call time.
 */

import * as vscode from 'vscode';

// ─── Regexes ──────────────────────────────────────────────────────────────────

const ALPINE_STORE_RE = /Alpine\.store\s*\(\s*['"](\w+)['"]/g;
const XREF_ATTR_RE = /x-ref=["'](\w+)["']/g;
// Match x-data attribute value (double- or single-quoted, single-line)
const XDATA_ATTR_RE = /x-data=(?:"([^"]*)"|'([^']*)')/g;

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
	while ((m = re.exec(text)) !== null) {
		const before = text.slice(0, m.index);
		const line = (before.match(/\n/g) ?? []).length;
		const lastNl = before.lastIndexOf('\n');
		const char = m.index - (lastNl + 1);
		locs.push({ name: m[1], line, char });
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
	const all: string[] = [];
	for (const entry of fileCache.values()) {
		all.push(...entry.storeNames);
	}
	return [...new Set(all)].sort();
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
	// Scan JS / TS / HTML template files — limit to 500 per glob to stay fast
	const exclude = '**/node_modules/**';
	const globs = ['**/*.js', '**/*.ts', '**/*.mjs', '**/*.html'];
	const uriLists = await Promise.all(
		globs.map(g => vscode.workspace.findFiles(g, exclude, 500)),
	);
	await Promise.all(uriLists.flat().map(scanFile));

	// Re-scan on create/change; evict on delete
	const watcher = vscode.workspace.createFileSystemWatcher(
		'**/*.{js,ts,mjs,html}',
	);
	watcher.onDidChange(uri => { void scanFile(uri); });
	watcher.onDidCreate(uri => { void scanFile(uri); });
	watcher.onDidDelete(uri => { fileCache.delete(uri.toString()); });

	context.subscriptions.push(watcher);
}
