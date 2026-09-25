/**
 * Pure logic: what a period is, what a task state is, how the numbers add up.
 * No Obsidian API in here, so every rule below is covered by tests.
 */

/**
 * Frontmatter values as text, without `String()` on an unknown.
 *
 * A YAML value can be a map or a list, and `String({})` yields `[object Object]`
 * — which then sails through a regex test as an ordinary non-match, so a broken
 * `miesiac:` looks exactly like an absent one. Anything that is not a scalar is
 * treated as absent instead.
 */
export function asText(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return '';
}

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

export type TaskState = 'planned' | 'inProgress' | 'done' | 'dropped';

export const TASK_STATES: TaskState[] = ['done', 'inProgress', 'planned', 'dropped'];

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
	/**
	 * Set when the goal counts checkboxes instead of a hand-written percent.
	 * The panel shows `done / total` rather than a plan figure, because that is
	 * the number the reader can act on.
	 */
	tasks?: { done: number; total: number };
}

/**
 * Obsidian reports the raw character between the brackets. Anything we do not
 * recognise counts as planned — an unknown marker is still an open task, and
 * silently dropping it would understate the backlog.
 */
export function taskState(marker: string | undefined): TaskState {
	switch ((marker ?? ' ').toLowerCase()) {
		case 'x':
			return 'done';
		case '/':
			return 'inProgress';
		case '-':
			return 'dropped';
		default:
			return 'planned';
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
	return String(n).padStart(2, '0');
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

	const month = asText(fm.miesiac).slice(0, 7);
	if (/^\d{4}-\d{2}$/.test(month)) {
		const y = Number(month.slice(0, 4));
		const m = Number(month.slice(5, 7));
		// Month 00 or 13 is a typo. It used to become a span of dates that do not
		// exist, drawn as an empty week with a link to "undefined 2026". Falling
		// through to `rok:` would be no better — a whole year under a monthly note.
		if (m < 1 || m > 12) return null;
		return { from: iso(y, m, 1), to: iso(y, m, daysInMonth(y, m)) };
	}

	const year = asText(fm.rok).slice(0, 4);
	if (/^\d{4}$/.test(year)) return { from: `${year}-01-01`, to: `${year}-12-31` };

	return null;
}

/** Frontmatter dates arrive as strings or as Date objects, depending on the value's shape. */
function isoOf(value: unknown): string | null {
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	const text = asText(value).slice(0, 10);
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

/** The longest span a periodic note describes: a leap year. */
export const MAX_SPAN_DAYS = 366;

const DAY_MS = 86_400_000;

/**
 * Days in the span, both ends included — by subtraction, not by listing them.
 * 0 when either end is not a date or the span runs backwards.
 *
 * Counting through `eachDate` cost a list of every day just to take its length,
 * and a render asks for the count several times: a year mistyped as `9026` built
 * two and a half million strings per call and froze Obsidian for seconds.
 */
export function spanDays(range: Range): number {
	const from = Date.parse(`${range.from}T00:00:00Z`);
	const to = Date.parse(`${range.to}T00:00:00Z`);
	if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
	return Math.round((to - from) / DAY_MS) + 1;
}

/**
 * Why this span cannot be drawn, in words for the block — or null when it can.
 * Checked before anything is counted, so a typo in the front matter costs a
 * message instead of a frozen window.
 */
export function rangeProblem(range: Range): string | null {
	const from = Date.parse(`${range.from}T00:00:00Z`);
	const to = Date.parse(`${range.to}T00:00:00Z`);
	// `Date.parse` rolls a day past the month's end forward — 2026-02-30 comes
	// back as 2 March — so a date only counts when it survives the round trip.
	if (!sameDay(from, range.from) || !sameDay(to, range.to)) {
		return `nie rozpoznaję daty w okresie ${range.from} – ${range.to}`;
	}
	if (to < from) {
		return `okres jest odwrócony: od ${range.from} do ${range.to} — sprawdź, czy \`od:\` i \`do:\` nie zamieniły się miejscami`;
	}
	const days = spanDays(range);
	if (days > MAX_SPAN_DAYS) {
		return `okres ma ${days} dni, a notatka okresowa obejmuje najwyżej rok — sprawdź rok w \`od:\` i \`do:\``;
	}
	return null;
}

function sameDay(time: number, text: string): boolean {
	return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === text;
}

/**
 * The period a block draws, or the sentence it shows instead. The whole gate
 * in front of the counting lives here, so dropping any part of it turns a test
 * red — when it sat inline in `render`, deleting it passed every test.
 */
export function periodOf(
	fm: Record<string, unknown> | undefined,
): { range: Range } | { problem: string } {
	const range = rangeFromFrontmatter(fm);
	if (!range) {
		return {
			problem:
				'ta notatka nie mówi, jaki okres opisuje — potrzebuję `od:` i `do:`, albo `miesiac:`, albo `rok:` we frontmatterze',
		};
	}
	const problem = rangeProblem(range);
	return problem ? { problem } : { range };
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

export interface Ranked {
	label: string;
	value: number;
}

/**
 * The whole tally, largest first, ties broken by name so two runs over the same
 * notes never swap two rows around. Nothing is folded away here — the donut
 * needs a short list, the bars under it need this one.
 */
export function rankTally(tally: Map<string, number>): Ranked[] {
	return [...tally.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([label, value]) => ({ label, value }));
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
	const sorted = rankTally(tally).map((r): [string, number] => [r.label, r.value]);
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
const ITEM = /^(\s*)[-*+]\s+(?:\[(.)\]\s+)?(.*)$/;
const PERCENT = /^(\d{1,3})\s*%?$/;

/**
 * `Name :: plan / actual`, taken apart with plain string operations.
 *
 * This used to be one regular expression with three `\s*` in a row after the
 * number. A line ending in a run of blanks and one stray character made the
 * engine try every way of sharing the blanks between them — cubic in their
 * count: 2000 spaces froze Obsidian for two seconds, 8000 for two minutes.
 * Here every blank is looked at a fixed number of times.
 *
 * Only the last `::` can start the numbers, since they contain no `::` of
 * their own — the same split the expression arrived at.
 */
function parseManual(text: string): { name: string; plan: number; actual: number } | null {
	const at = text.lastIndexOf('::');
	if (at < 0) return null;
	const parts = text.slice(at + 2).split('/');
	if (parts.length > 2) return null;
	const plan = (parts[0] ?? '').trim().match(PERCENT);
	if (!plan) return null;
	let actual = 0;
	if (parts.length === 2) {
		const second = (parts[1] ?? '').trim().match(PERCENT);
		if (!second) return null;
		actual = Number(second[1]);
	}
	return { name: text.slice(0, at).trim(), plan: Number(plan[1]), actual };
}

interface Item {
	indent: number;
	marker: string | undefined;
	text: string;
}

/**
 * Goals are optional and hand-written. Three shapes are accepted, and one
 * section can mix them:
 *
 *     - Nazwa celu :: 80 / 85      ← percent typed by hand: plan, then actual
 *     - [x] Nazwa celu             ← a checkbox: done or not
 *     - [ ] Nazwa celu             ← with sub-tasks below, progress is their tally
 *         - [x] krok pierwszy
 *         - [ ] krok drugi
 *
 * The checkbox forms exist so the number nobody wants to maintain by hand — the
 * percentage — is counted instead. A dropped sub-task (`[-]`) leaves the tally
 * entirely: it is no longer part of the plan, so counting it as outstanding
 * would make a finished goal look unfinished forever.
 *
 * A line without `::` and without a checkbox is prose and is skipped, so notes
 * can live in the same section.
 */
export function parseGoals(lines: string[]): Goal[] {
	const items: Item[] = [];
	for (const raw of lines) {
		const m = raw.match(ITEM);
		if (m) items.push({ indent: m[1]?.length ?? 0, marker: m[2], text: (m[3] ?? '').trim() });
	}
	if (items.length === 0) return [];

	const base = Math.min(...items.map((i) => i.indent));
	const goals: Goal[] = [];

	for (const [index, item] of items.entries()) {
		if (item.indent !== base) continue;

		const manual = parseManual(item.text);
		if (manual) {
			if (!manual.name) continue;
			goals.push({
				name: manual.name,
				plan: clampPercent(manual.plan),
				actual: clampPercent(manual.actual),
			});
			continue;
		}

		if (item.marker === undefined || !item.text) continue;

		const children: Item[] = [];
		for (let i = index + 1; i < items.length; i++) {
			const next = items[i];
			if (!next || next.indent <= base) break;
			if (next.marker !== undefined) children.push(next);
		}

		const counted = (children.length > 0 ? children : [item]).filter(
			(t) => taskState(t.marker) !== 'dropped',
		);
		if (counted.length === 0) continue;
		const done = counted.filter((t) => taskState(t.marker) === 'done').length;

		goals.push({
			name: item.text,
			plan: 100,
			actual: clampPercent(Math.round((done / counted.length) * 100)),
			tasks: { done, total: counted.length },
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
