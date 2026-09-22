import { type MarkdownPostProcessorContext, Plugin, TFile } from 'obsidian';
import {
	barRows,
	donut,
	goalBars,
	header,
	type LinkGroup,
	lineChart,
	linkGroups,
	type Point,
	rankedBars,
	type Slice,
	sparkline,
} from './charts';
import { collectDays, collectGoals, type Sources } from './collect';
import {
	type Day,
	daysInMonth,
	eachDate,
	inRange,
	projectTally,
	type Range,
	rangeFromFrontmatter,
	rangeProblem,
	rankTally,
	spanDays,
	tallyTasks,
	topWithRest,
	trend,
	weeksOfMonth,
} from './model';
import {
	DEFAULT_SETTINGS,
	type DiaryStatsSettings,
	DiaryStatsSettingTab,
	projectNameList,
} from './settings';

const PANELS = [
	'naglowek',
	'cele',
	'projekty',
	'aktywnosc',
	'zadania',
	'metryki',
	'odnosniki',
] as const;
type Panel = (typeof PANELS)[number];

// Capitalised, matching the month names in the note and folder names.
const MONTHS = [
	'Styczeń',
	'Luty',
	'Marzec',
	'Kwiecień',
	'Maj',
	'Czerwiec',
	'Lipiec',
	'Sierpień',
	'Wrzesień',
	'Październik',
	'Listopad',
	'Grudzień',
];
const WEEKDAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
/** Genitive, for week titles like "Tydzień 1 (1–7 sierpnia)". */
const MONTHS_OF = [
	'stycznia',
	'lutego',
	'marca',
	'kwietnia',
	'maja',
	'czerwca',
	'lipca',
	'sierpnia',
	'września',
	'października',
	'listopada',
	'grudnia',
];

export default class DiaryStatsPlugin extends Plugin {
	settings: DiaryStatsSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new DiaryStatsSettingTab(this.app, this));

		this.registerMarkdownCodeBlockProcessor('diary-stats', async (source, el, ctx) => {
			try {
				await this.render(source, el, ctx);
			} catch (error) {
				el.createDiv({
					cls: 'ds-error',
					text: `Diary Stats: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
		});
	}

	async loadSettings(): Promise<void> {
		// `loadData()` is whatever sits in data.json — an older shape, or nothing.
		const stored = (await this.loadData()) as Partial<DiaryStatsSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private get sources(): Sources {
		return {
			diaryFolder: this.settings.diaryFolder,
			sessionFolder: this.settings.sessionFolder,
			goalsHeading: this.settings.goalsHeading,
			projectNames: projectNameList(this.settings.projectNames),
		};
	}

	private async render(
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) throw new Error('nie widzę tej notatki');

		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const range = rangeFromFrontmatter(fm);
		if (!range) {
			throw new Error(
				'ta notatka nie mówi, jaki okres opisuje — potrzebuję `od:` i `do:`, albo `miesiac:`, albo `rok:` we frontmatterze',
			);
		}
		const problem = rangeProblem(range);
		if (problem) throw new Error(problem);

		const wanted = parsePanels(source);
		const days = collectDays(this.app, range, this.sources);
		const root = el.createDiv({ cls: 'ds-root' });

		if (wanted.has('naglowek')) {
			const kind = spanKind(range);
			header(
				root.createDiv({ cls: 'ds-panel ds-panel-header' }),
				`${{ week: 'TYGODNIOWE', month: 'MIESIĘCZNE', year: 'ROCZNE' }[kind]} PODSUMOWANIE`,
				periodTitle(range, kind, file.basename),
				[
					{ label: 'Okres', value: `${dmy(range.from)} – ${dmy(range.to)}` },
					{
						label: 'Dni z wpisem',
						value: `${days.length} / ${spanDays(range)}`,
					},
					{ label: 'Sesje', value: String(days.reduce((s, d) => s + d.sessions.length, 0)) },
					{
						label: 'Zamknięte zadania',
						value: String(days.reduce((s, d) => s + d.tasks.done, 0)),
					},
				],
			);
		}

		if (wanted.has('cele')) {
			const goals = await collectGoals(this.app, file, this.sources);
			// Silence is the feature: no goals written means no panel, no scolding.
			if (goals.length > 0) {
				// Two kinds of goal read differently, so the caption says which one
				// this note is using rather than guessing a single wording.
				const counted = goals.filter((g) => g.tasks);
				const done = counted.reduce((sum, g) => sum + (g.tasks?.done ?? 0), 0);
				const all = counted.reduce((sum, g) => sum + (g.tasks?.total ?? 0), 0);
				const caption =
					counted.length === goals.length
						? `${done} z ${all} zadań zamkniętych`
						: `${goals.length} · plan kontra realizacja`;
				goalBars(panel(root, 'Cele', caption), goals);
			}
		}

		if (wanted.has('projekty')) {
			const tally = projectTally(days);
			const slices = topWithRest(tally, this.settings.maxProjects, 'Pozostałe').map(
				(entry, i): Slice => ({
					label: entry.label,
					value: entry.value,
					tone: `${i + 1}`,
					...(entry.members ? { detail: entry.members.join(', ') } : {}),
				}),
			);
			const sessions = days.reduce((sum, d) => sum + d.sessions.length, 0);
			const box = panel(root, 'Rozkład na projekty', 'wzmianki projektu w sesjach okresu');
			donut(box, slices, String(sessions), sessions === 1 ? 'sesja' : 'sesji');

			// The donut stops where the palette does, and past that point "Pozostałe"
			// hides more than it shows — on a busy month it is the largest slice by far.
			// The bars below unpack exactly that slice: the tail only, never the rows
			// the legend already names, so nothing is said twice.
			const ranked = rankTally(tally);
			const rest = ranked.slice(this.settings.maxProjects);
			if (rest.length > 0) {
				const whole = ranked.reduce((sum, r) => sum + r.value, 0);
				box.createDiv({
					cls: 'ds-subhead',
					text: `W „Pozostałych" (${rest.length})`,
				});
				rankedBars(box, rest, whole, this.settings.maxProjects);
			}
		}

		if (wanted.has('aktywnosc')) {
			const span = spanKind(range);
			const box = panel(
				root,
				'Aktywność w czasie',
				span === 'year' ? 'sesje w kolejnych miesiącach' : 'sesje w kolejnych dniach',
			);
			if (span === 'year') {
				barRows(box, monthPoints(days, range), 'sesji');
			} else {
				lineChart(box, dayPoints(days, range), 'sesji');
			}
			if (span === 'month') {
				barRows(
					panel(root, 'Cztery tygodnie', 'ten sam miesiąc w czterech kawałkach'),
					weekPoints(days, range),
					'sesji',
				);
			}
		}

		if (wanted.has('zadania')) {
			const tasks = tallyTasks(days);
			const total = tasks.done + tasks.inProgress + tasks.planned + tasks.dropped;
			donut(
				panel(root, 'Zadania', 'stan na koniec okresu'),
				[
					{ label: 'Ukończone', value: tasks.done, tone: 'done' },
					{ label: 'W trakcie', value: tasks.inProgress, tone: 'progress' },
					{ label: 'Zaplanowane', value: tasks.planned, tone: 'planned' },
					{ label: 'Porzucone', value: tasks.dropped, tone: 'dropped' },
				],
				String(total),
				total === 1 ? 'zadanie' : 'zadań',
			);
		}

		if (wanted.has('metryki')) {
			this.metrics(panel(root, 'Kluczowe metryki', 'trend wewnątrz okresu'), days, range);
		}

		if (wanted.has('odnosniki')) {
			// This panel almost always sits under a `## Powiązane` heading of its own
			// at the foot of the note. A panel title would then be a second heading
			// under the first, so it only appears when the block draws something else
			// as well.
			const sam = wanted.size === 1;
			linkGroups(
				sam
					? root.createDiv({ cls: 'ds-panel ds-panel-bare' })
					: panel(root, 'Powiązane notatki', 'wszystko klikalne, lista rośnie sama'),
				this.linksOf(days, range, ctx.sourcePath),
			);
		}
	}

	/**
	 * Up and down the hierarchy — week to its month and year, month to its four
	 * weeks. Derived from the period, so the names always match the ones your
	 * periodic notes carry; nothing has to be written into the note.
	 */
	private navigation(days: Day[], range: Range, fromPath: string): LinkGroup {
		const year = Number(range.from.slice(0, 4));
		const month = Number(range.from.slice(5, 7));
		const kind = spanKind(range);
		const targets: { target: string; label: string }[] = [];

		if (kind === 'week') {
			targets.push({ target: monthNote(year, month), label: `${MONTHS[month - 1]} ${year}` });
			targets.push({ target: yearNote(year), label: String(year) });
		} else if (kind === 'month') {
			targets.push({ target: yearNote(year), label: String(year) });
			for (const i of weeksOfMonth(year, month).keys()) {
				targets.push({ target: weekNote(year, month, i + 1), label: `Tydzień ${i + 1}` });
			}
		} else {
			const touched = new Set(days.map((day) => Number(day.date.slice(5, 7))));
			for (const m of [...touched].sort((a, b) => a - b)) {
				targets.push({ target: monthNote(year, m), label: MONTHS[m - 1] ?? String(m) });
			}
		}

		const exists = (target: string) =>
			this.app.metadataCache.getFirstLinkpathDest(target, fromPath) !== null;
		return {
			title: 'Wyżej i niżej',
			links: targets.map((entry) => ({ ...entry, missing: !exists(entry.target) })),
		};
	}

	/**
	 * Session filenames are ASCII slugs — `…-czesc-2-zapis` — so a label derived
	 * from the filename reads like a page of typos and mangles anything hyphenated
	 * (`P1-02b` became `P1 02b`). The note's own first heading is the real title,
	 * with its accented letters intact; the slug is only the fallback.
	 */
	private sessionLabel(linkName: string, fromPath: string): string {
		const file = this.app.metadataCache.getFirstLinkpathDest(linkName, fromPath);
		const heading = file
			? this.app.metadataCache.getFileCache(file)?.headings?.find((h) => h.level === 1)
			: undefined;
		// The group is already titled SESJE, so a "Sesja: …" prefix on every label is
		// a repetition that only eats width. Strips the shapes actually written:
		// "Sesja:", "Sesja —", "Sesja 2026-08-06 —".
		const title = heading?.heading.replace(/^\s*Sesja\b[\s\d-]*[—:–-]?\s*/i, '').trim();
		if (title) return title;
		return linkName.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/-/g, ' ');
	}

	/**
	 * The note's own sources as links. Kept out of the note body deliberately —
	 * a written-in list goes stale the moment a day or a session log is added.
	 */
	private linksOf(days: Day[], range: Range, fromPath: string): LinkGroup[] {
		const sessions = new Map<string, string>();
		const projects = new Set<string>();
		for (const day of days) {
			for (const session of day.sessions)
				sessions.set(session, this.sessionLabel(session, fromPath));
			for (const project of day.projects) projects.add(project);
		}

		const exists = (target: string) =>
			this.app.metadataCache.getFirstLinkpathDest(target, fromPath) !== null;

		return [
			this.navigation(days, range, fromPath),
			{
				title: 'Dni',
				links: days.map((day) => ({
					target: day.path.replace(/\.md$/, '').split('/').pop() ?? day.date,
					label: dayLabel(day.date),
				})),
			},
			{
				title: 'Sesje',
				links: [...sessions.entries()]
					.sort((a, b) => a[0].localeCompare(b[0]))
					.map(([target, label]) => ({ target, label, missing: !exists(target) })),
			},
			{
				title: 'Projekty',
				links: [...projects]
					.sort((a, b) => a.localeCompare(b))
					.map((target) => ({ target, label: target, missing: !exists(target) })),
			},
		];
	}

	/**
	 * Trend is computed inside the note's own period — weeks of a month, months of
	 * a year — so a panel never depends on sibling notes existing.
	 */
	private metrics(host: HTMLElement, days: Day[], range: Range): void {
		const buckets = bucketsOf(range);
		const table = host.createDiv({ cls: 'ds-metrics' });

		const rows: { name: string; value: string; series: number[] }[] = [
			{
				name: 'Sesje',
				value: String(days.reduce((s, d) => s + d.sessions.length, 0)),
				series: buckets.map((b) => sum(days, b, (d) => d.sessions.length)),
			},
			{
				name: 'Zadania ukończone',
				value: String(days.reduce((s, d) => s + d.tasks.done, 0)),
				series: buckets.map((b) => sum(days, b, (d) => d.tasks.done)),
			},
			{
				name: 'Dni z wpisem',
				value: String(days.length),
				series: buckets.map((b) => days.filter((d) => inRange(d.date, b)).length),
			},
			{
				name: 'Projekty',
				value: String(new Set(days.flatMap((d) => d.projects)).size),
				series: buckets.map(
					(b) => new Set(days.filter((d) => inRange(d.date, b)).flatMap((d) => d.projects)).size,
				),
			},
		];

		for (const row of rows) {
			const line = table.createDiv({ cls: 'ds-metric-row' });
			line.createSpan({ cls: 'ds-metric-name', text: row.name });
			line.createSpan({ cls: 'ds-metric-value', text: row.value });
			sparkline(line.createDiv({ cls: 'ds-metric-spark' }), row.series);
			const change = trend(row.series);
			const chip = line.createSpan({ cls: 'ds-metric-trend' });
			if (change === null) {
				chip.setText('—');
			} else {
				chip.addClass(change > 0 ? 'is-up' : change < 0 ? 'is-down' : 'is-flat');
				chip.setText(change > 0 ? `↑ ${change}%` : change < 0 ? `↓ ${-change}%` : '→ 0%');
			}
		}
	}
}

// Note names must match how your periodic notes are titled, or a link points at nothing.
function monthNote(year: number, month: number): string {
	return `${MONTHS[month - 1]} ${year} — podsumowanie`;
}

function yearNote(year: number): string {
	return `${year} — podsumowanie`;
}

function weekNote(year: number, month: number, nr: number): string {
	const week = weeksOfMonth(year, month)[nr - 1];
	if (!week) return '';
	const from = Number(week.from.slice(8, 10));
	const to = Number(week.to.slice(8, 10));
	return `Tydzień ${nr} (${from}–${to} ${MONTHS_OF[month - 1]})`;
}

function dayLabel(date: string): string {
	const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? '';
	return `${weekday} ${Number(date.slice(8, 10))}.${date.slice(5, 7)}`;
}

/**
 * Big name at the top. A week has no natural short name, so it keeps the one the
 * file already carries — that name is what the reader clicked to get here.
 */
function periodTitle(range: Range, kind: 'week' | 'month' | 'year', basename: string): string {
	const year = Number(range.from.slice(0, 4));
	if (kind === 'year') return String(year);
	if (kind === 'month') return `${MONTHS[Number(range.from.slice(5, 7)) - 1] ?? ''} ${year}`;
	return basename.replace(/\s*—\s*podsumowanie$/i, '');
}

function dmy(iso: string): string {
	return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

function panel(root: HTMLElement, title: string, caption: string): HTMLElement {
	const box = root.createDiv({ cls: 'ds-panel' });
	const head = box.createDiv({ cls: 'ds-panel-head' });
	head.createEl('h4', { cls: 'ds-panel-title', text: title });
	head.createSpan({ cls: 'ds-panel-caption', text: caption });
	return box.createDiv({ cls: 'ds-panel-body' });
}

function parsePanels(source: string): Set<Panel> {
	const line = source
		.split('\n')
		.map((l) => l.trim())
		.find((l) => l.toLowerCase().startsWith('panele:'));
	if (!line) return new Set(PANELS);
	const asked = line
		.slice(line.indexOf(':') + 1)
		.split(',')
		.map((name) => name.trim().toLowerCase())
		.filter((name): name is Panel => (PANELS as readonly string[]).includes(name));
	return asked.length > 0 ? new Set(asked) : new Set(PANELS);
}

function spanKind(range: Range): 'week' | 'month' | 'year' {
	const days = spanDays(range);
	if (days <= 10) return 'week';
	return days <= 31 ? 'month' : 'year';
}

function sum(days: Day[], range: Range, of: (day: Day) => number): number {
	return days.filter((d) => inRange(d.date, range)).reduce((total, d) => total + of(d), 0);
}

/** Every date in the span, including the ones with no note — a gap is information. */
function dayPoints(days: Day[], range: Range): Point[] {
	const byDate = new Map(days.map((d) => [d.date, d]));
	return eachDate(range).map((date) => {
		const day = byDate.get(date);
		const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
		return {
			label: `${weekday} ${Number(date.slice(8, 10))}.${date.slice(5, 7)}`,
			value: day?.sessions.length ?? 0,
			note: day ? `${day.tasks.done} zamkniętych` : 'brak wpisu',
		};
	});
}

function weekPoints(days: Day[], range: Range): Point[] {
	const year = Number(range.from.slice(0, 4));
	const month = Number(range.from.slice(5, 7));
	return weeksOfMonth(year, month).map((week, i) => ({
		label: `Tydzień ${i + 1}`,
		value: sum(days, week, (d) => d.sessions.length),
		note: `${Number(week.from.slice(8, 10))}–${Number(week.to.slice(8, 10))} ${MONTHS[month - 1] ?? ''}`,
	}));
}

function monthPoints(days: Day[], range: Range): Point[] {
	const year = Number(range.from.slice(0, 4));
	return MONTHS.map((name, i) => {
		const month: Range = {
			from: `${year}-${String(i + 1).padStart(2, '0')}-01`,
			to: `${year}-${String(i + 1).padStart(2, '0')}-${String(daysInMonth(year, i + 1)).padStart(2, '0')}`,
		};
		return { label: name, value: sum(days, month, (d) => d.sessions.length) };
	}).filter((point) => point.value > 0);
}

/** Sub-periods the sparkline steps through: days for a week, weeks for a month, months for a year. */
function bucketsOf(range: Range): Range[] {
	const kind = spanKind(range);
	if (kind === 'week') return eachDate(range).map((date) => ({ from: date, to: date }));
	const year = Number(range.from.slice(0, 4));
	if (kind === 'month') return weeksOfMonth(year, Number(range.from.slice(5, 7)));
	return MONTHS.map((_, i) => ({
		from: `${year}-${String(i + 1).padStart(2, '0')}-01`,
		to: `${year}-${String(i + 1).padStart(2, '0')}-${String(daysInMonth(year, i + 1)).padStart(2, '0')}`,
	}));
}
