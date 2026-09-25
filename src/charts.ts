/**
 * SVG chart builders. Every colour is a CSS custom property defined in
 * `styles.css`, so light and dark are two selected palettes rather than one
 * palette flipped — and the theme switch costs nothing at runtime.
 */

import { axisTicks, type Goal } from './model';

const NS = 'http://www.w3.org/2000/svg';

export interface Slice {
	label: string;
	value: number;
	/** 1-based categorical slot, or a role name like `done`. */
	tone: string;
	/** Extra line in the tooltip — used to unpack a folded "rest" slice. */
	detail?: string;
}

export interface Point {
	label: string;
	value: number;
	/** Shown in the tooltip under the value. */
	note?: string;
}

function svg(
	parent: Element,
	tag: string,
	attrs: Record<string, string | number> = {},
): SVGElement {
	const node = document.createElementNS(NS, tag);
	for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
	parent.appendChild(node);
	return node;
}

function tone(name: string): string {
	return `var(--ds-tone-${name})`;
}

/** One tooltip per chart, positioned over the hovered mark. */
function tooltip(host: HTMLElement): {
	show: (x: number, y: number, title: string, body: string) => void;
	hide: () => void;
} {
	// Visibility is a class, position goes through custom properties: the only
	// genuinely dynamic values here are the two coordinates, and everything a
	// theme might want to restyle stays in `styles.css`. Built once — a move of
	// the mouse only swaps two strings, instead of two new elements per event.
	const box = host.createDiv({ cls: 'ds-tip' });
	const titleEl = box.createDiv({ cls: 'ds-tip-title' });
	const bodyEl = box.createDiv({ cls: 'ds-tip-body' });
	return {
		show(x, y, title, body) {
			titleEl.setText(title);
			bodyEl.setText(body);
			box.setCssProps({ '--ds-tip-x': `${x}px`, '--ds-tip-y': `${y}px` });
			box.addClass('is-shown');
		},
		hide() {
			box.removeClass('is-shown');
		},
	};
}

/**
 * Pointer handling at most once per frame. `mousemove` fires faster than the
 * screen redraws, and each handler reads the layout right after the previous
 * one changed it — a forced reflow per event. Here the latest event waits for
 * the frame and the older ones are dropped. The frame is the one of the window
 * the chart sits in, so a note in a popped-out window keeps its tooltip.
 */
function hover(target: Element, onMove: (event: MouseEvent) => void, onLeave: () => void): void {
	let latest: MouseEvent | null = null;
	let frame = 0;
	target.addEventListener('mousemove', (event) => {
		latest = event as MouseEvent;
		if (frame) return;
		frame = target.win.requestAnimationFrame(() => {
			frame = 0;
			if (latest) onMove(latest);
		});
	});
	target.addEventListener('mouseleave', () => {
		if (frame) target.win.cancelAnimationFrame(frame);
		frame = 0;
		latest = null;
		onLeave();
	});
}

function total(slices: Slice[]): number {
	return slices.reduce((sum, s) => sum + s.value, 0);
}

function percent(value: number, whole: number): string {
	if (whole === 0) return '0%';
	return `${Math.round((value / whole) * 100)}%`;
}

/**
 * Donut with a headline number in the hole. Segments are separated by a 2px
 * surface-coloured gap so touching hues never blend into one another.
 */
export function donut(host: HTMLElement, slices: Slice[], centre: string, caption: string): void {
	const whole = total(slices);
	if (whole === 0) {
		host.createDiv({ cls: 'ds-empty', text: 'Brak danych w tym okresie.' });
		return;
	}

	const wrap = host.createDiv({ cls: 'ds-donut' });
	const tip = tooltip(wrap);
	const size = 220;
	const r = 84;
	const thickness = 30;
	const root = svg(wrap, 'svg', {
		viewBox: `0 0 ${size} ${size}`,
		class: 'ds-donut-svg',
		role: 'img',
		'aria-label': caption,
	});

	// A stroked circle with dash offsets draws cleaner arcs than paths, and the
	// dash gap gives the 2px separator for free.
	const circumference = 2 * Math.PI * r;
	const gap = 2;
	let offset = 0;

	for (const slice of slices) {
		const length = (slice.value / whole) * circumference;
		const arc = svg(root, 'circle', {
			cx: size / 2,
			cy: size / 2,
			r,
			fill: 'none',
			stroke: tone(slice.tone),
			'stroke-width': thickness,
			'stroke-dasharray': `${Math.max(0, length - gap)} ${circumference - Math.max(0, length - gap)}`,
			'stroke-dashoffset': -offset,
			transform: `rotate(-90 ${size / 2} ${size / 2})`,
			class: 'ds-arc',
		});
		hover(
			arc,
			(event) => {
				const box = wrap.getBoundingClientRect();
				tip.show(
					event.clientX - box.left,
					event.clientY - box.top,
					slice.label,
					slice.detail
						? `${slice.value} · ${percent(slice.value, whole)} — ${slice.detail}`
						: `${slice.value} · ${percent(slice.value, whole)}`,
				);
			},
			() => tip.hide(),
		);
		offset += length;
	}

	svg(root, 'text', {
		x: size / 2,
		y: size / 2 - 2,
		'text-anchor': 'middle',
		class: 'ds-donut-centre',
	}).textContent = centre;
	svg(root, 'text', {
		x: size / 2,
		y: size / 2 + 20,
		'text-anchor': 'middle',
		class: 'ds-donut-caption',
	}).textContent = caption;

	// Legend carries the label and the number, so identity never rests on colour
	// alone — required, because three light-mode hues sit under 3:1 on white.
	const legend = wrap.createDiv({ cls: 'ds-legend' });
	for (const slice of slices) {
		const row = legend.createDiv({ cls: 'ds-legend-row' });
		const swatch = svg(row, 'svg', { width: 12, height: 12, class: 'ds-swatch' });
		svg(swatch, 'rect', { width: 12, height: 12, rx: 3, fill: tone(slice.tone) });
		row.createSpan({ cls: 'ds-legend-label', text: slice.label });
		row.createSpan({ cls: 'ds-legend-value', text: `${slice.value}` });
		row.createSpan({ cls: 'ds-legend-pct', text: percent(slice.value, whole) });
	}
}

/**
 * Activity over time. One series, so no legend — the heading names it.
 * Crosshair follows the pointer and the nearest point gets a ring.
 */
export function lineChart(host: HTMLElement, points: Point[], unit: string): void {
	if (points.length === 0) {
		host.createDiv({ cls: 'ds-empty', text: 'Brak dni z wpisem w tym okresie.' });
		return;
	}

	const wrap = host.createDiv({ cls: 'ds-line' });
	const tip = tooltip(wrap);
	const w = 720;
	const h = 240;
	const pad = { top: 16, right: 16, bottom: 34, left: 34 };
	const max = Math.max(1, ...points.map((p) => p.value));
	const ticks = axisTicks(max);
	// The axis rounds the maximum up to a whole step, so the topmost point sits
	// under the top gridline rather than on the very edge of the box.
	const top = ticks[ticks.length - 1] ?? max;
	const root = svg(wrap, 'svg', { viewBox: `0 0 ${w} ${h}`, class: 'ds-line-svg' });

	const x = (i: number) =>
		points.length === 1
			? (pad.left + w - pad.right) / 2
			: pad.left + (i * (w - pad.left - pad.right)) / (points.length - 1);
	const y = (v: number) => h - pad.bottom - (v / top) * (h - pad.top - pad.bottom);

	// Recessive grid: no box, no vertical rules, one line per whole-number tick.
	for (const value of ticks) {
		svg(root, 'line', {
			x1: pad.left,
			x2: w - pad.right,
			y1: y(value),
			y2: y(value),
			class: 'ds-grid',
		});
		svg(root, 'text', {
			x: pad.left - 8,
			y: y(value) + 4,
			'text-anchor': 'end',
			class: 'ds-axis',
		}).textContent = String(Math.round(value));
	}

	const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(p.value)}`).join(' ');
	svg(root, 'path', {
		d: `${path} L${x(points.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`,
		class: 'ds-area',
	});
	svg(root, 'path', { d: path, class: 'ds-stroke' });

	for (const [i, p] of points.entries()) {
		svg(root, 'circle', { cx: x(i), cy: y(p.value), r: 4, class: 'ds-dot' });
	}

	// Labels only where they can be read: first, last, and the peak.
	const peak = points.reduce((best, p, i) => (p.value > (points[best]?.value ?? 0) ? i : best), 0);
	for (const i of new Set([0, peak, points.length - 1])) {
		const point = points[i];
		if (!point) continue;
		svg(root, 'text', {
			x: x(i),
			y: h - pad.bottom + 18,
			'text-anchor': i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle',
			class: 'ds-axis',
		}).textContent = point.label;
	}

	const cross = svg(root, 'line', { y1: pad.top, y2: h - pad.bottom, class: 'ds-cross' });
	cross.setAttribute('opacity', '0');
	const halo = svg(root, 'circle', { r: 6, class: 'ds-dot-active' });
	halo.setAttribute('opacity', '0');

	// Hit target spans the full plot height, so the pointer never has to find a 4px dot.
	const hit = svg(root, 'rect', {
		x: pad.left,
		y: pad.top,
		width: w - pad.left - pad.right,
		height: h - pad.top - pad.bottom,
		fill: 'transparent',
	});
	hover(
		hit,
		(event) => {
			const box = root.getBoundingClientRect();
			const local = ((event.clientX - box.left) / box.width) * w;
			let nearest = 0;
			for (let i = 1; i < points.length; i++) {
				if (Math.abs(x(i) - local) < Math.abs(x(nearest) - local)) nearest = i;
			}
			const p = points[nearest];
			if (!p) return;
			cross.setAttribute('x1', String(x(nearest)));
			cross.setAttribute('x2', String(x(nearest)));
			cross.setAttribute('opacity', '1');
			halo.setAttribute('cx', String(x(nearest)));
			halo.setAttribute('cy', String(y(p.value)));
			halo.setAttribute('opacity', '1');
			const hostBox = wrap.getBoundingClientRect();
			tip.show(
				event.clientX - hostBox.left,
				event.clientY - hostBox.top,
				p.label,
				p.note ? `${p.value} ${unit} · ${p.note}` : `${p.value} ${unit}`,
			);
		},
		() => {
			cross.setAttribute('opacity', '0');
			halo.setAttribute('opacity', '0');
			tip.hide();
		},
	);
}

/** Horizontal bars, one row per item — for weeks of a month or months of a year. */
export function barRows(host: HTMLElement, points: Point[], unit: string): void {
	if (points.length === 0) {
		host.createDiv({ cls: 'ds-empty', text: 'Brak danych.' });
		return;
	}
	const max = Math.max(1, ...points.map((p) => p.value));
	const table = host.createDiv({ cls: 'ds-bars' });
	for (const p of points) {
		const row = table.createDiv({ cls: 'ds-bar-row' });
		row.createSpan({ cls: 'ds-bar-label', text: p.label });
		const track = row.createDiv({ cls: 'ds-bar-track' });
		track
			.createDiv({ cls: 'ds-bar-fill' })
			.setCssProps({ '--ds-bar-w': `${(p.value / max) * 100}%` });
		row.createSpan({ cls: 'ds-bar-value', text: `${p.value} ${unit}` });
		if (p.note) row.setAttribute('title', p.note);
	}
}

/**
 * The tail the donut folds away, one row each. Only the tail: the slices above
 * already have a name, a colour and a number in the legend, and a second copy of
 * them here would say nothing new.
 *
 * Colour runs as one ramp from first row to last instead of eight repeating
 * hues. Identity is already carried by the name, and a row tinted like a donut
 * slice it has nothing to do with would be a lie; a ramp reads as one group —
 * which is exactly what these rows are — and still gives the eye an order.
 * Length is measured against the longest row here, so the tail spreads across
 * the whole track; the percentage stays a share of the entire period, so it can
 * be compared with the legend above.
 */
export function rankedBars(host: HTMLElement, rows: Point[], whole: number, from = 0): void {
	if (rows.length === 0) {
		host.createDiv({ cls: 'ds-empty', text: 'Nic się nie zwinęło — wszystko widać wyżej.' });
		return;
	}
	const max = Math.max(1, ...rows.map((r) => r.value));
	const last = Math.max(1, rows.length - 1);
	const table = host.createDiv({ cls: 'ds-rank' });
	for (const [i, row] of rows.entries()) {
		const line = table.createDiv({ cls: 'ds-rank-row' });
		line.createSpan({ cls: 'ds-rank-index', text: `${from + i + 1}` });
		line.createSpan({ cls: 'ds-rank-label', text: row.label });
		const track = line.createDiv({ cls: 'ds-rank-track' });
		track.createDiv({ cls: 'ds-rank-fill' }).setCssProps({
			'--ds-rank-w': `${(row.value / max) * 100}%`,
			// Position on the ramp, 0 at the top row and 1 at the bottom one.
			'--ds-rank-t': `${i / last}`,
		});
		line.createSpan({ cls: 'ds-rank-value', text: `${row.value}` });
		line.createSpan({ cls: 'ds-rank-pct', text: percent(row.value, whole) });
		if (row.note) line.setAttribute('title', row.note);
	}
}

/** Plan against actual, one row per goal. Actual overlays the planned track. */
export function goalBars(host: HTMLElement, goals: Goal[]): void {
	const table = host.createDiv({ cls: 'ds-goals' });
	for (const goal of goals) {
		const row = table.createDiv({ cls: 'ds-goal-row' });
		row.createSpan({ cls: 'ds-goal-name', text: goal.name });
		// A goal counted from checkboxes shows the tally: "3 / 5" is actionable in a
		// way that "100%" planned is not.
		row.createSpan({
			cls: 'ds-goal-plan',
			text: goal.tasks ? `${goal.tasks.done} / ${goal.tasks.total}` : `${goal.plan}%`,
		});
		const track = row.createDiv({ cls: 'ds-goal-track' });
		track.createDiv({ cls: 'ds-goal-planned' }).setCssProps({ '--ds-goal-w': `${goal.plan}%` });
		track.createDiv({ cls: 'ds-goal-actual' }).setCssProps({ '--ds-goal-w': `${goal.actual}%` });
		row.createSpan({ cls: 'ds-goal-actual-value', text: `${goal.actual}%` });
		const reached = goal.actual >= goal.plan;
		row.createSpan({
			cls: `ds-goal-status ${reached ? 'is-reached' : 'is-behind'}`,
			// Icon plus the word, never colour alone.
			text: reached ? '✓ osiągnięty' : '◔ w toku',
		});
	}
}

export interface HeaderFacts {
	label: string;
	value: string;
}

/**
 * The note's own title block: a small kicker over a large name, with the hard
 * facts in a box beside it. Rendered here rather than typed into the note so it
 * cannot drift from the period the charts below actually cover.
 */
export function header(
	host: HTMLElement,
	kicker: string,
	title: string,
	facts: HeaderFacts[],
): void {
	const wrap = host.createDiv({ cls: 'ds-header' });

	const left = wrap.createDiv({ cls: 'ds-header-name' });
	left.createDiv({ cls: 'ds-kicker', text: kicker });
	left.createDiv({ cls: 'ds-title', text: title });

	if (facts.length === 0) return;
	const box = wrap.createDiv({ cls: 'ds-facts' });
	for (const fact of facts) {
		const row = box.createDiv({ cls: 'ds-fact' });
		row.createSpan({ cls: 'ds-fact-label', text: fact.label });
		row.createSpan({ cls: 'ds-fact-value', text: fact.value });
	}
}

export interface LinkGroup {
	title: string;
	/** `target` is what a wikilink would contain; `label` is what the reader sees. */
	links: { target: string; label: string; missing?: boolean }[];
}

/** Anything starting like `scheme:` — never a note name, which cannot hold a colon. */
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Everything the period was built from, as real Obsidian links. Rendered by the
 * plugin rather than written into the note so it can never go stale: add a day
 * or a session log and the list grows on its own.
 */
export function linkGroups(host: HTMLElement, groups: LinkGroup[]): void {
	const visible = groups.filter((group) => group.links.length > 0);
	if (visible.length === 0) {
		host.createDiv({ cls: 'ds-empty', text: 'Nic jeszcze nie wpięte w ten okres.' });
		return;
	}

	const wrap = host.createDiv({ cls: 'ds-links' });
	for (const group of visible) {
		const column = wrap.createDiv({ cls: 'ds-link-group' });
		column.createDiv({
			cls: 'ds-link-group-title',
			text: `${group.title} (${group.links.length})`,
		});
		const list = column.createDiv({ cls: 'ds-link-list' });
		for (const link of group.links) {
			// A target shaped like a URL (`javascript:…`, `https:…`) is not a note —
			// a colon cannot appear in a file name. It stays text, so the plugin never
			// hands a note's front matter to a link as an address; today Obsidian
			// intercepts every click on `internal-link`, but that is its guard, not ours.
			if (URL_SCHEME.test(link.target)) {
				list.createSpan({ cls: 'ds-link is-unresolved', text: link.label });
				continue;
			}
			const anchor = list.createEl('a', {
				cls: `internal-link ds-link${link.missing ? ' is-unresolved' : ''}`,
				text: link.label,
			});
			// Obsidian resolves clicks and hover previews off these two attributes.
			anchor.setAttribute('href', link.target);
			anchor.setAttribute('data-href', link.target);
		}
	}
}

/** Tiny trend line for the metrics table. No axes, no labels — it shows shape only. */
export function sparkline(host: HTMLElement, values: number[]): void {
	if (values.length < 2) {
		host.createSpan({ cls: 'ds-spark-empty', text: '—' });
		return;
	}
	const w = 120;
	const h = 28;
	const max = Math.max(...values);
	const min = Math.min(...values);
	const span = max - min || 1;
	const root = svg(host, 'svg', { viewBox: `0 0 ${w} ${h}`, class: 'ds-spark' });
	const x = (i: number) => (i * w) / (values.length - 1);
	const y = (v: number) => h - 3 - ((v - min) / span) * (h - 6);
	svg(root, 'path', {
		d: values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(v)}`).join(' '),
		class: 'ds-spark-line',
	});
	svg(root, 'circle', {
		cx: x(values.length - 1),
		cy: y(values[values.length - 1] ?? min),
		r: 3,
		class: 'ds-spark-end',
	});
}
