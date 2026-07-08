// Validates documentation content before build.
// Catches the mistakes that most often break translation PRs:
//   1. Broken relative paths (imports, hero images) - the classic "copied from
//      English but the file lives one folder deeper" bug
//   2. Missing version/lastUpdated frontmatter (breaks the translation status page)
//   3. Orphaned translations (translated file with no English counterpart)
//
// Exits non-zero with a readable report if anything fails.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';

const DOCS_DIR = resolve('src/content/docs');
const LOCALES = ['ru', 'pl', 'de', 'fr', 'ta'];

const errors = [];
const warnings = [];

function walk(dir) {
	const files = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			files.push(...walk(full));
		} else if (/\.(md|mdx)$/.test(entry)) {
			files.push(full);
		}
	}
	return files;
}

function relPath(file) {
	return relative(process.cwd(), file).split(sep).join('/');
}

function parseFrontmatter(content) {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	return match ? match[1] : null;
}

const allFiles = walk(DOCS_DIR);

// version per file, for cross-locale comparison after the per-file checks
const versions = new Map();

for (const file of allFiles) {
	const content = readFileSync(file, 'utf-8');
	const rel = relPath(file);
	const fileDir = dirname(file);

	// --- Check 1: frontmatter fields ---
	const frontmatter = parseFrontmatter(content);
	if (!frontmatter) {
		errors.push(`${rel}: missing frontmatter block`);
		continue;
	}
	if (!/^title:/m.test(frontmatter)) {
		errors.push(`${rel}: missing "title" in frontmatter`);
	}
	if (!/^lastUpdated:/m.test(frontmatter)) {
		errors.push(`${rel}: missing "lastUpdated" in frontmatter (required for the translation status page)`);
	}
	const versionMatch = frontmatter.match(/^version:\s*["']?([^\s"']+)/m);
	if (!versionMatch) {
		errors.push(`${rel}: missing "version" in frontmatter (used to compare translations against the English page)`);
	} else {
		versions.set(relative(DOCS_DIR, file).split(sep).join('/'), versionMatch[1]);
	}

	// --- Check 2: relative paths resolve ---
	// ESM imports: import X from '../../foo'
	const importPattern = /^import\s+.*?from\s+['"](\.[^'"]+)['"]/gm;
	// Frontmatter/asset refs: file: ../../foo.svg, src="../foo.png"
	const assetPattern = /(?:file:\s*|src=["'])(\.[^\s"']+)/g;

	const refs = [];
	for (const m of content.matchAll(importPattern)) refs.push(m[1]);
	for (const m of content.matchAll(assetPattern)) refs.push(m[1]);

	for (const ref of refs) {
		const target = resolve(fileDir, ref);
		// Imports may omit the extension
		const candidates = [target, `${target}.ts`, `${target}.js`, `${target}.mjs`, `${target}.astro`];
		if (!candidates.some((c) => existsSync(c))) {
			errors.push(`${rel}: broken relative path "${ref}" (resolves to ${relPath(target)}, which does not exist)`);
		}
	}

	// --- Check 3: orphaned translations ---
	const relFromDocs = relative(DOCS_DIR, file).split(sep).join('/');
	const firstSegment = relFromDocs.split('/')[0];
	if (LOCALES.includes(firstSegment)) {
		const englishPath = join(DOCS_DIR, relFromDocs.split('/').slice(1).join('/'));
		if (!existsSync(englishPath)) {
			errors.push(`${rel}: no English counterpart at ${relPath(englishPath)} (orphaned translation)`);
		}
	}
}

// --- Check 4: translation version drift (informational) ---
for (const [docPath, version] of versions) {
	const firstSegment = docPath.split('/')[0];
	if (!LOCALES.includes(firstSegment)) continue;
	const englishPath = docPath.split('/').slice(1).join('/');
	const englishVersion = versions.get(englishPath);
	if (englishVersion && version !== englishVersion) {
		warnings.push(
			`src/content/docs/${docPath}: version ${version} differs from English (${englishVersion}) - will show as outdated on the status page`
		);
	}
}

// --- Report ---
if (warnings.length > 0) {
	console.log(`\n${warnings.length} warning(s):`);
	for (const w of warnings) console.log(`  WARN  ${w}`);
}

if (errors.length > 0) {
	console.error(`\n${errors.length} error(s):`);
	for (const e of errors) console.error(`  FAIL  ${e}`);
	console.error('\nDocs validation failed.');
	process.exit(1);
}

console.log(`\nDocs validation passed: ${allFiles.length} files checked, 0 errors, ${warnings.length} warning(s).`);
