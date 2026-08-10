/**
 * Reads the vault. Everything here goes through Obsidian's metadata cache
 * rather than re-parsing files, so a repaint costs nothing and stays in step
 * with what the rest of Obsidian believes about the notes.
 */

import type { App, TFile } from "obsidian";
import {
	type Day,
	emptyTasks,
	type Goal,
	inRange,
	parseGoals,
	type Range,
	taskState,
} from "./model";

const SESSION_LINK = /^\d{4}-\d{2}-\d{2}-/;
const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

export interface Sources {
	/** Folder holding the diary, e.g. `_Dziennik`. */
	diaryFolder: string;
	/** Folder holding session logs, e.g. `_Sesje`. */
	sessionFolder: string;
	/** Heading under which the user writes optional goals. */
	goalsHeading: string;
	/** Preferred spellings of project names; every variant of one folds onto it. */
	projectNames: readonly string[];
}

/** Day notes are named `YYYY-MM-DD (weekday)`, so the date is the filename prefix. */
function dateOf(file: TFile): string | null {
	const match = file.basename.match(DATE_PREFIX);
	return match?.[1] ?? null;
}

export function collectDays(app: App, range: Range, sources: Sources): Day[] {
	const days: Day[] = [];
	const casing = projectCasing(sources.projectNames);

	for (const file of app.vault.getMarkdownFiles()) {
		if (!file.path.startsWith(`${sources.diaryFolder}/`)) continue;
		const date = dateOf(file);
		if (!date || !inRange(date, range)) continue;

		const cache = app.metadataCache.getFileCache(file);
		const day: Day = { date, path: file.path, sessions: [], projects: [], tasks: emptyTasks() };

		for (const link of cache?.links ?? []) {
			const name = (link.link.split("#")[0] ?? "").split("|")[0]?.trim() ?? "";
			if (SESSION_LINK.test(name)) day.sessions.push(name);
		}

		for (const item of cache?.listItems ?? []) {
			if (item.task === undefined) continue;
			day.tasks[taskState(item.task)] += 1;
		}

		for (const session of day.sessions) {
			day.projects.push(...projectsOfSession(app, session, file.path, casing));
		}

		days.push(day);
	}

	return days.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * A session log says which projects it touched in `dotyczy:`. Older logs often
 * predate that field, so `tags: [projekt/…]` is the fallback — without it those
 * sessions would silently vanish from the project breakdown.
 */
function projectsOfSession(
	app: App,
	linkName: string,
	fromPath: string,
	casing: ReadonlyMap<string, string>,
): string[] {
	const file = app.metadataCache.getFirstLinkpathDest(linkName, fromPath);
	if (!file) return [];
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm) return [];

	const covers = fm.dotyczy;
	if (Array.isArray(covers) && covers.length > 0) {
		return covers.map((entry) => canonical(String(entry), casing)).filter(Boolean);
	}

	const tags = Array.isArray(fm.tags) ? fm.tags : [];
	return tags
		.map((tag) => String(tag))
		.filter((tag) => tag.startsWith("projekt/"))
		.map((tag) => canonical(tag.slice("projekt/".length), casing))
		.filter(Boolean);
}

/** Case, spaces, dashes and underscores all collapse, so every spelling lands on one key. */
function foldKey(name: string): string {
	return name.toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * One project is often written several ways across notes — `Foo Bar`, `foobar`,
 * `projekt/foo-bar`. Left alone each spelling becomes its own slice and the chart
 * understates the project it splits.
 *
 * The preferred spellings come from settings, so the plugin ships knowing none:
 * write a name there and every variant of it folds onto that one. Folding happens
 * on the reading side on purpose — rewriting someone's notes to make a chart tidy
 * would be the wrong trade.
 */
export function projectCasing(names: readonly string[]): ReadonlyMap<string, string> {
	const pairs: [string, string][] = [];
	for (const raw of names) {
		const name = raw.trim();
		if (name) pairs.push([foldKey(name), name]);
	}
	return new Map(pairs);
}

export function canonical(name: string, casing?: ReadonlyMap<string, string>): string {
	const trimmed = name.trim();
	if (!trimmed) return "";
	const known = casing?.get(foldKey(trimmed));
	if (known) return known;
	// Unknown project: keep what the user wrote, but give a bare slug a capital
	// so `foo` and `Foo` do not sit side by side as two slices.
	return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Goals are whatever the user wrote under the goals heading of this very note.
 * Nothing is required: an absent or empty section simply means no goal panel.
 */
export async function collectGoals(app: App, file: TFile, sources: Sources): Promise<Goal[]> {
	const cache = app.metadataCache.getFileCache(file);
	const headings = cache?.headings ?? [];
	const index = headings.findIndex(
		(h) => h.heading.trim().toLowerCase() === sources.goalsHeading.trim().toLowerCase(),
	);
	if (index === -1) return [];

	const start = headings[index];
	if (!start) return [];
	const next = headings.slice(index + 1).find((h) => h.level <= start.level);
	const text = await app.vault.cachedRead(file);
	const lines = text.split("\n");
	const from = start.position.end.line + 1;
	const to = next ? next.position.start.line : lines.length;

	return parseGoals(lines.slice(from, to));
}
