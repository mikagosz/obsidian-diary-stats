/**
 * Pure logic: what a period is, what a task state is, how the numbers add up.
 * No Obsidian API in here, so every rule below is covered by tests.
 */

/**
 * Gridline values for an axis counting whole things — sessions, tasks, days.
 * Splitting the maximum into a fixed number of slices puts fractions on the
 * axis, and two of them can round to the same label: a maximum of three drew
 * `0, 1, 2, 2, 3`. Instead pick a step of 1, 2, 5 or ten times one of those —
 * the first that brings the axis down to `most` lines or fewer.
 */
export function axisTicks(max: number, most = 4): number[] {
	const ceiling = Math.max(1, Math.ceil(max));
	let step = 1;
	for (let scale = 1; ; scale *= 10) {
		const fits = [1, 2, 5].map((m) => m * scale).find((candidate) => ceiling / candidate <= most);
		if (fits) {
			step = fits;
			break;
		}
	}
	const ticks: number[] = [];
	for (let value = 0; value <= Math.ceil(ceiling / step) * step; value += step) ticks.push(value);
	return ticks;
}

export type TaskState = "planned" | "inProgress" | "done" | "dropped";

export const TASK_STATES: TaskState[] = ["done", "inProgress", "planned", "dropped"];

export interface Day {
	/** ISO date, YYYY-MM-DD */
	date: string;
	path: string;
	/** One entry per link to a session log, e.g. `2026-08-09-Color-Note`. */
	sessions: string[];
	/** Project names credited to this day, one entry per session-to-project pair. */
	projects: string[];
	tasks: Record<TaskState, number>;
}

export interface Range {
	from: string;
	to: string;
}

export interface Goal {
	name: string;
	/** Percent the user planned to reach. */
	plan: number;
	/** Percent actually reached. */
	actual: number;
}

/**
 * Obsidian reports the raw character between the brackets. Anything we do not
 * recognise counts as planned — an unknown marker is still an open task, and
 * silently dropping it would understate the backlog.
 */
export function taskState(marker: string | undefined): TaskState {
	switch ((marker ?? " ").toLowerCase()) {
		case "x":
			return "done";
		case "/":
			return "inProgress";
		case "-":
			return "dropped";
		default:
			return "planned";
	}
}

export function emptyTasks(): Record<TaskState, number> {
	return { planned: 0, inProgress: 0, done: 0, dropped: 0 };
}

export function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Weeks are counted by day-of-month, not by calendar week: 1–7, 8–14, 15–21,
 * 22–end. Always four, always inside one month.
 *
 * Whatever generates your periodic notes has to split weeks the same way. If the
 * two ever disagree, a chart will describe a different span than the table beside
 * it — so keep the rule in one place and derive both from it.
 */
export function weeksOfMonth(year: number, month: number): Range[] {
	const last = daysInMonth(year, month);
	const bounds: [number, number][] = [
		[1, 7],
		[8, 14],
		[15, 21],
		[22, last],
	];
	return bounds.map(([a, b]) => ({ from: iso(year, month, a), to: iso(year, month, b) }));
}

export function weekNumber(date: string): number {
	const day = Number(date.slice(8, 10));
	return Math.min(4, Math.floor((day - 1) / 7) + 1);
}

function iso(year: number, month: number, day: number): string {
	return `${year}-${pad(month)}-${pad(day)}`;
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/**
 * Which span does this note cover? Weekly notes carry `od`/`do`, monthly notes
 * carry `miesiac`, yearly ones `rok`. Returns null when the note is not periodic.
 */
export function rangeFromFrontmatter(fm: Record<string, unknown> | undefined): Range | null {
	if (!fm) return null;

	const from = isoOf(fm.od);
	const to = isoOf(fm.do);
	if (from && to) return { from, to };

	const month = String(fm.miesiac ?? "").slice(0, 7);
	if (/^\d{4}-\d{2}$/.test(month)) {
		const y = Number(month.slice(0, 4));
		const m = Number(month.slice(5, 7));
		return { from: iso(y, m, 1), to: iso(y, m, daysInMonth(y, m)) };
	}

	const year = String(fm.rok ?? "").slice(0, 4);
	if (/^\d{4}$/.test(year)) return { from: `${year}-01-01`, to: `${year}-12-31` };

	return null;
}

/** Frontmatter dates arrive as strings or as Date objects, depending on the value's shape. */
function isoOf(value: unknown): string | null {
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	const text = String(value ?? "").slice(0, 10);
	return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function eachDate(range: Range): string[] {
	const out: string[] = [];
	const end = Date.parse(`${range.to}T00:00:00Z`);
	for (let t = Date.parse(`${range.from}T00:00:00Z`); t <= end; t += 86_400_000) {
		out.push(new Date(t).toISOString().slice(0, 10));
	}
	return out;
}

export function inRange(date: string, range: Range): boolean {
	return date >= range.from && date <= range.to;
}

/**
 * Counts every project mention. A session touching three projects credits all
 * three — the chart answers "what did the period go into", not "how many sessions".
 */
export function projectTally(days: Day[]): Map<string, number> {
	const tally = new Map<string, number>();
	for (const day of days) {
		for (const project of day.projects) {
			tally.set(project, (tally.get(project) ?? 0) + 1);
		}
	}
	return tally;
}

/**
 * Largest first, and everything past `keep` folded into one slice. Categorical
 * palettes run out at eight; a ninth generated hue is never the answer.
 */
export function topWithRest(
	tally: Map<string, number>,
	keep: number,
	restLabel: string,
): { label: string; value: number; members?: string[] }[] {
	const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	const head: { label: string; value: number; members?: string[] }[] = sorted
		.slice(0, keep)
		.map(([label, value]) => ({ label, value }));
	const tail = sorted.slice(keep);
	const rest = tail.reduce((sum, [, value]) => sum + value, 0);
	// The folded slice is often the biggest one, so it has to say what is inside it.
	if (rest > 0) {
		head.push({
			label: restLabel,
			value: rest,
			members: tail.map(([label, value]) => `${label} ${value}`),
		});
	}
	return head;
}

export function tallyTasks(days: Day[]): Record<TaskState, number> {
	const total = emptyTasks();
	for (const day of days) {
		for (const state of TASK_STATES) total[state] += day.tasks[state];
	}
	return total;
}

/**
 * Goals are optional and hand-written. Accepted shapes, one per list item:
 *
 *     - Nazwa celu :: 80
 *     - Nazwa celu :: 80 / 85
 *
 * First number is the plan, second the actual. A line without `::` is treated as
 * prose and skipped, so the user can keep notes in the same section.
 */
export function parseGoals(lines: string[]): Goal[] {
	const goals: Goal[] = [];
	for (const raw of lines) {
		const match = raw.match(/^(.*?)\s*::\s*(\d{1,3})\s*%?\s*(?:\/\s*(\d{1,3})\s*%?)?\s*$/);
		if (!match) continue;
		const name = (match[1] ?? "").replace(/^[-*+]\s*/, "").replace(/^\[.\]\s*/, "").trim();
		if (!name) continue;
		goals.push({
			name,
			plan: clampPercent(Number(match[2] ?? 0)),
			actual: clampPercent(Number(match[3] ?? 0)),
		});
	}
	return goals;
}

function clampPercent(n: number): number {
	if (!Number.isFinite(n)) return 0;
	return Math.max(0, Math.min(100, n));
}

/** Percent change against the previous value; null when there is nothing to compare to. */
export function trend(values: number[]): number | null {
	if (values.length < 2) return null;
	const previous = values[values.length - 2] ?? 0;
	const current = values[values.length - 1] ?? 0;
	if (previous === 0) return current === 0 ? 0 : null;
	return Math.round(((current - previous) / previous) * 100);
}
