/**
 * SVG chart builders. Every colour is a CSS custom property defined in
 * `styles.css`, so light and dark are two selected palettes rather than one
 * palette flipped — and the theme switch costs nothing at runtime.
 */

import { axisTicks } from "./model";

const NS = "http://www.w3.org/2000/svg";

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

function svg(parent: Element, tag: string, attrs: Record<string, string | number> = {}): SVGElement {
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
	// theme might want to restyle stays in `styles.css`.
	const box = host.createDiv({ cls: "ds-tip" });
	return {
		show(x, y, title, body) {
			box.empty();
			box.createDiv({ cls: "ds-tip-title", text: title });
			box.createDiv({ cls: "ds-tip-body", text: body });
			box.setCssProps({ "--ds-tip-x": `${x}px`, "--ds-tip-y": `${y}px` });
			box.addClass("is-shown");
		},
		hide() {
			box.removeClass("is-shown");
		},
	};
}

function total(slices: Slice[]): number {
	return slices.reduce((sum, s) => sum + s.value, 0);
}

function percent(value: number, whole: number): string {
	if (whole === 0) return "0%";
	return `${Math.round((value / whole) * 100)}%`;
}

/**
 * Donut with a headline number in the hole. Segments are separated by a 2px
 * surface-coloured gap so touching hues never blend into one another.
 */
export function donut(host: HTMLElement, slices: Slice[], centre: string, caption: string): void {
	const whole = total(slices);
	if (whole === 0) {
		host.createDiv({ cls: "ds-empty", text: "Brak danych w tym okresie." });
		return;
	}

	const wrap = host.createDiv({ cls: "ds-donut" });
	const tip = tooltip(wrap);
	const size = 220;
	const r = 84;
	const thickness = 30;
	const root = svg(wrap, "svg", {
		viewBox: `0 0 ${size} ${size}`,
		class: "ds-donut-svg",
		role: "img",
		"aria-label": caption,
	});

	// A stroked circle with dash offsets draws cleaner arcs than paths, and the
	// dash gap gives the 2px separator for free.
	const circumference = 2 * Math.PI * r;
	const gap = 2;
	let offset = 0;

	for (const slice of slices) {
		const length = (slice.value / whole) * circumference;
		const arc = svg(root, "circle", {
			cx: size / 2,
			cy: size / 2,
			r,
			fill: "none",
			stroke: tone(slice.tone),
			"stroke-width": thickness,
			"stroke-dasharray": `${Math.max(0, length - gap)} ${circumference - Math.max(0, length - gap)}`,
			"stroke-dashoffset": -offset,
			transform: `rotate(-90 ${size / 2} ${size / 2})`,
			class: "ds-arc",
		});
		arc.addEventListener("mousemove", (event) => {
			const box = wrap.getBoundingClientRect();
			tip.show(
				event.clientX - box.left,
				event.clientY - box.top,
				slice.label,
				slice.detail
					? `${slice.value} · ${percent(slice.value, whole)} — ${slice.detail}`
					: `${slice.value} · ${percent(slice.value, whole)}`,
			);
		});
		arc.addEventListener("mouseleave", () => tip.hide());
		offset += length;
	}

	svg(root, "text", {
		x: size / 2,
		y: size / 2 - 2,
		"text-anchor": "middle",
		class: "ds-donut-centre",
	}).textContent = centre;
	svg(root, "text", {
		x: size / 2,
		y: size / 2 + 20,
		"text-anchor": "middle",
		class: "ds-donut-caption",
	}).textContent = caption;

	// Legend carries the label and the number, so identity never rests on colour
	// alone — required, because three light-mode hues sit under 3:1 on white.
	const legend = wrap.createDiv({ cls: "ds-legend" });
	for (const slice of slices) {
		const row = legend.createDiv({ cls: "ds-legend-row" });
		const swatch = svg(row, "svg", { width: 12, height: 12, class: "ds-swatch" });
		svg(swatch, "rect", { width: 12, height: 12, rx: 3, fill: tone(slice.tone) });
		row.createSpan({ cls: "ds-legend-label", text: slice.label });
		row.createSpan({ cls: "ds-legend-value", text: `${slice.value}` });
		row.createSpan({ cls: "ds-legend-pct", text: percent(slice.value, whole) });
	}
}

/**
 * Activity over time. One series, so no legend — the heading names it.
 * Crosshair follows the pointer and the nearest point gets a ring.
 */
export function lineChart(host: HTMLElement, points: Point[], unit: string): void {
	if (points.length === 0) {
		host.createDiv({ cls: "ds-empty", text: "Brak dni z wpisem w tym okresie." });
		return;
	}

	const wrap = host.createDiv({ cls: "ds-line" });
	const tip = tooltip(wrap);
	const w = 720;
	const h = 240;
	const pad = { top: 16, right: 16, bottom: 34, left: 34 };
	const max = Math.max(1, ...points.map((p) => p.value));
	const ticks = axisTicks(max);
	// The axis rounds the maximum up to a whole step, so the topmost point sits
	// under the top gridline rather than on the very edge of the box.
	const top = ticks[ticks.length - 1] ?? max;
	const root = svg(wrap, "svg", { viewBox: `0 0 ${w} ${h}`, class: "ds-line-svg" });

	const x = (i: number) =>
		points.length === 1
			? (pad.left + w - pad.right) / 2
			: pad.left + (i * (w - pad.left - pad.right)) / (points.length - 1);
	const y = (v: number) => h - pad.bottom - (v / top) * (h - pad.top - pad.bottom);

	// Recessive grid: no box, no vertical rules, one line per whole-number tick.
	for (const value of ticks) {
		svg(root, "line", {
			x1: pad.left,
			x2: w - pad.right,
			y1: y(value),
			y2: y(value),
			class: "ds-grid",
		});
		svg(root, "text", {
			x: pad.left - 8,
			y: y(value) + 4,
			"text-anchor": "end",
			class: "ds-axis",
		}).textContent = String(Math.round(value));
	}

	const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)} ${y(p.value)}`).join(" ");
	svg(root, "path", {
		d: `${path} L${x(points.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`,
		class: "ds-area",
	});
	svg(root, "path", { d: path, class: "ds-stroke" });

	for (const [i, p] of points.entries()) {
		svg(root, "circle", { cx: x(i), cy: y(p.value), r: 4, class: "ds-dot" });
	}

	// Labels only where they can be read: first, last, and the peak.
	const peak = points.reduce((best, p, i) => (p.value > (points[best]?.value ?? 0) ? i : best), 0);
	for (const i of new Set([0, peak, points.length - 1])) {
		const point = points[i];
		if (!point) continue;
		svg(root, "text", {
			x: x(i),
			y: h - pad.bottom + 18,
			"text-anchor": i === 0 ? "start" : i === points.length - 1 ? "end" : "middle",
			class: "ds-axis",
		}).textContent = point.label;
	}

	const cross = svg(root, "line", { y1: pad.top, y2: h - pad.bottom, class: "ds-cross" });
	cross.setAttribute("opacity", "0");
	const halo = svg(root, "circle", { r: 6, class: "ds-dot-active" });
	halo.setAttribute("opacity", "0");

	// Hit target spans the full plot height, so the pointer never has to find a 4px dot.
	const hit = svg(root, "rect", {
		x: pad.left,
		y: pad.top,
		width: w - pad.left - pad.right,
		height: h - pad.top - pad.bottom,
		fill: "transparent",
	});
	hit.addEventListener("mousemove", (event) => {
		const box = root.getBoundingClientRect();
		const local = ((event.clientX - box.left) / box.width) * w;
		let nearest = 0;
		for (let i = 1; i < points.length; i++) {
			if (Math.abs(x(i) - local) < Math.abs(x(nearest) - local)) nearest = i;
		}
		const p = points[nearest];
		if (!p) return;
		cross.setAttribute("x1", String(x(nearest)));
		cross.setAttribute("x2", String(x(nearest)));
		cross.setAttribute("opacity", "1");
		halo.setAttribute("cx", String(x(nearest)));
		halo.setAttribute("cy", String(y(p.value)));
		halo.setAttribute("opacity", "1");
		const hostBox = wrap.getBoundingClientRect();
		tip.show(
			event.clientX - hostBox.left,
			event.clientY - hostBox.top,
			p.label,
			p.note ? `${p.value} ${unit} · ${p.note}` : `${p.value} ${unit}`,
		);
	});
	hit.addEventListener("mouseleave", () => {
		cross.setAttribute("opacity", "0");
		halo.setAttribute("opacity", "0");
		tip.hide();
	});
}

/** Horizontal bars, one row per item — for weeks of a month or months of a year. */
export function barRows(host: HTMLElement, points: Point[], unit: string): void {
	if (points.length === 0) {
		host.createDiv({ cls: "ds-empty", text: "Brak danych." });
		return;
	}
	const max = Math.max(1, ...points.map((p) => p.value));
	const table = host.createDiv({ cls: "ds-bars" });
	for (const p of points) {
		const row = table.createDiv({ cls: "ds-bar-row" });
		row.createSpan({ cls: "ds-bar-label", text: p.label });
		const track = row.createDiv({ cls: "ds-bar-track" });
		const fill = track.createDiv({ cls: "ds-bar-fill" });
		fill.style.width = `${(p.value / max) * 100}%`;
		row.createSpan({ cls: "ds-bar-value", text: `${p.value} ${unit}` });
		if (p.note) row.setAttribute("title", p.note);
	}
}

/** Plan against actual, one row per goal. Actual overlays the planned track. */
export function goalBars(
	host: HTMLElement,
	goals: { name: string; plan: number; actual: number }[],
): void {
	const table = host.createDiv({ cls: "ds-goals" });
	for (const goal of goals) {
		const row = table.createDiv({ cls: "ds-goal-row" });
		row.createSpan({ cls: "ds-goal-name", text: goal.name });
		row.createSpan({ cls: "ds-goal-plan", text: `${goal.plan}%` });
		const track = row.createDiv({ cls: "ds-goal-track" });
		const planned = track.createDiv({ cls: "ds-goal-planned" });
		planned.style.width = `${goal.plan}%`;
		const actual = track.createDiv({ cls: "ds-goal-actual" });
		actual.style.width = `${goal.actual}%`;
		row.createSpan({ cls: "ds-goal-actual-value", text: `${goal.actual}%` });
		const reached = goal.actual >= goal.plan;
		row.createSpan({
			cls: `ds-goal-status ${reached ? "is-reached" : "is-behind"}`,
			// Icon plus the word, never colour alone.
			text: reached ? "✓ osiągnięty" : "◔ w toku",
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
	const wrap = host.createDiv({ cls: "ds-header" });

	const left = wrap.createDiv({ cls: "ds-header-name" });
	left.createDiv({ cls: "ds-kicker", text: kicker });
	left.createDiv({ cls: "ds-title", text: title });

	if (facts.length === 0) return;
	const box = wrap.createDiv({ cls: "ds-facts" });
	for (const fact of facts) {
		const row = box.createDiv({ cls: "ds-fact" });
		row.createSpan({ cls: "ds-fact-label", text: fact.label });
		row.createSpan({ cls: "ds-fact-value", text: fact.value });
	}
}

export interface LinkGroup {
	title: string;
	/** `target` is what a wikilink would contain; `label` is what the reader sees. */
	links: { target: string; label: string; missing?: boolean }[];
}

/**
 * Everything the period was built from, as real Obsidian links. Rendered by the
 * plugin rather than written into the note so it can never go stale: add a day
 * or a session log and the list grows on its own.
 */
export function linkGroups(host: HTMLElement, groups: LinkGroup[]): void {
	const visible = groups.filter((group) => group.links.length > 0);
	if (visible.length === 0) {
		host.createDiv({ cls: "ds-empty", text: "Nic jeszcze nie wpięte w ten okres." });
		return;
	}

	const wrap = host.createDiv({ cls: "ds-links" });
	for (const group of visible) {
		const column = wrap.createDiv({ cls: "ds-link-group" });
		column.createDiv({
			cls: "ds-link-group-title",
			text: `${group.title} (${group.links.length})`,
		});
		const list = column.createDiv({ cls: "ds-link-list" });
		for (const link of group.links) {
			const anchor = list.createEl("a", {
				cls: `internal-link ds-link${link.missing ? " is-unresolved" : ""}`,
				text: link.label,
			});
			// Obsidian resolves clicks and hover previews off these two attributes.
			anchor.setAttribute("href", link.target);
			anchor.setAttribute("data-href", link.target);
		}
	}
}

/** Tiny trend line for the metrics table. No axes, no labels — it shows shape only. */
export function sparkline(host: HTMLElement, values: number[]): void {
	if (values.length < 2) {
		host.createSpan({ cls: "ds-spark-empty", text: "—" });
		return;
	}
	const w = 120;
	const h = 28;
	const max = Math.max(...values);
	const min = Math.min(...values);
	const span = max - min || 1;
	const root = svg(host, "svg", { viewBox: `0 0 ${w} ${h}`, class: "ds-spark" });
	const x = (i: number) => (i * w) / (values.length - 1);
	const y = (v: number) => h - 3 - ((v - min) / span) * (h - 6);
	svg(root, "path", {
		d: values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)} ${y(v)}`).join(" "),
		class: "ds-spark-line",
	});
	svg(root, "circle", {
		cx: x(values.length - 1),
		cy: y(values[values.length - 1] ?? min),
		r: 3,
		class: "ds-spark-end",
	});
}
