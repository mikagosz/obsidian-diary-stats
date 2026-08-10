import { describe, expect, it } from "vitest";
import { canonical, projectCasing } from "../src/collect";
import {
	asText,
	axisTicks,
	eachDate,
	parseGoals,
	projectTally,
	rangeFromFrontmatter,
	taskState,
	topWithRest,
	trend,
	weekNumber,
	weeksOfMonth,
} from "../src/model";

describe("taskState", () => {
	it("maps the four markers", () => {
		expect(taskState(" ")).toBe("planned");
		expect(taskState("/")).toBe("inProgress");
		expect(taskState("x")).toBe("done");
		expect(taskState("X")).toBe("done");
		expect(taskState("-")).toBe("dropped");
	});

	it("treats an unknown marker as still open, never as done", () => {
		expect(taskState("?")).toBe("planned");
		expect(taskState(undefined)).toBe("planned");
	});
});

describe("weeksOfMonth", () => {
	it("always yields four weeks, the last one absorbing the remainder", () => {
		const august = weeksOfMonth(2026, 8);
		expect(august).toHaveLength(4);
		expect(august[0]).toEqual({ from: "2026-08-01", to: "2026-08-07" });
		expect(august[3]).toEqual({ from: "2026-08-22", to: "2026-08-31" });
	});

	it("handles February, including a leap year", () => {
		expect(weeksOfMonth(2026, 2)[3]).toEqual({ from: "2026-02-22", to: "2026-02-28" });
		expect(weeksOfMonth(2028, 2)[3]).toEqual({ from: "2028-02-22", to: "2028-02-29" });
	});

	it("covers every day of the month without gaps or overlaps", () => {
		for (let month = 1; month <= 12; month++) {
			const covered = weeksOfMonth(2026, month).flatMap((week) => eachDate(week));
			expect(new Set(covered).size).toBe(covered.length);
			expect(covered[0]).toBe(`2026-${String(month).padStart(2, "0")}-01`);
		}
	});

	it("agrees with weekNumber", () => {
		expect(weekNumber("2026-08-07")).toBe(1);
		expect(weekNumber("2026-08-08")).toBe(2);
		expect(weekNumber("2026-08-21")).toBe(3);
		expect(weekNumber("2026-08-22")).toBe(4);
		expect(weekNumber("2026-08-31")).toBe(4);
	});
});

describe("asText", () => {
	it("passes scalars through", () => {
		expect(asText("2026-08")).toBe("2026-08");
		expect(asText(2026)).toBe("2026");
	});

	it("treats a map or a list as absent, instead of stringifying it", () => {
		expect(asText({ a: 1 })).toBe("");
		expect(asText(["2026-08"])).toBe("");
		expect(asText(null)).toBe("");
		expect(asText(undefined)).toBe("");
	});
});

describe("rangeFromFrontmatter", () => {
	it("ignores a period field that came in as a map or a list", () => {
		expect(rangeFromFrontmatter({ miesiac: { rok: 2026 } })).toBeNull();
		expect(rangeFromFrontmatter({ rok: ["2026"] })).toBeNull();
	});

	it("reads a weekly note", () => {
		expect(rangeFromFrontmatter({ od: "2026-08-01", do: "2026-08-07" })).toEqual({
			from: "2026-08-01",
			to: "2026-08-07",
		});
	});

	it("accepts dates that arrived as Date objects", () => {
		const range = rangeFromFrontmatter({
			od: new Date("2026-08-01T00:00:00Z"),
			do: new Date("2026-08-07T00:00:00Z"),
		});
		expect(range).toEqual({ from: "2026-08-01", to: "2026-08-07" });
	});

	it("expands a month and a year", () => {
		expect(rangeFromFrontmatter({ miesiac: "2026-02" })).toEqual({
			from: "2026-02-01",
			to: "2026-02-28",
		});
		expect(rangeFromFrontmatter({ rok: "2026" })).toEqual({
			from: "2026-01-01",
			to: "2026-12-31",
		});
	});

	it("returns null for a note that is not periodic", () => {
		expect(rangeFromFrontmatter(undefined)).toBeNull();
		expect(rangeFromFrontmatter({ tags: ["typ/sesja"] })).toBeNull();
	});
});

describe("eachDate", () => {
	it("includes both ends", () => {
		expect(eachDate({ from: "2026-08-01", to: "2026-08-03" })).toEqual([
			"2026-08-01",
			"2026-08-02",
			"2026-08-03",
		]);
	});

	it("crosses a month boundary and a DST change without dropping a day", () => {
		expect(eachDate({ from: "2026-10-24", to: "2026-11-02" })).toHaveLength(10);
	});
});

describe("projectTally and topWithRest", () => {
	const days = [
		{ date: "2026-08-01", path: "", sessions: [], projects: ["A", "B"], tasks: blank() },
		{ date: "2026-08-02", path: "", sessions: [], projects: ["A", "A", "C"], tasks: blank() },
	];

	it("counts every mention, not every session", () => {
		expect(projectTally(days)).toEqual(new Map([["A", 3], ["B", 1], ["C", 1]]));
	});

	it("folds the tail into one slice instead of inventing a colour", () => {
		const sliced = topWithRest(projectTally(days), 1, "Pozostałe");
		expect(sliced).toEqual([
			{ label: "A", value: 3 },
			{ label: "Pozostałe", value: 2, members: ["B 1", "C 1"] },
		]);
	});

	it("names what went into the folded slice, because it is often the biggest one", () => {
		const rest = topWithRest(projectTally(days), 1, "Pozostałe")[1];
		expect(rest?.members).toEqual(["B 1", "C 1"]);
	});

	it("omits the rest slice when nothing is left over", () => {
		expect(topWithRest(projectTally(days), 8, "Pozostałe")).toHaveLength(3);
	});
});

describe("parseGoals", () => {
	it("reads plan and actual, with or without percent signs", () => {
		expect(parseGoals(["- Project X v1.4 :: 80 / 85", "- Dokumentacja :: 40%"])).toEqual([
			{ name: "Project X v1.4", plan: 80, actual: 85 },
			{ name: "Dokumentacja", plan: 40, actual: 0 },
		]);
	});

	it("skips prose so notes can live in the same section", () => {
		expect(parseGoals(["Trochę myśli o miesiącu.", "- bez liczby"])).toEqual([]);
	});

	it("strips a checkbox and clamps nonsense percentages", () => {
		expect(parseGoals(["- [ ] Cel :: 300 / 150"])).toEqual([
			{ name: "Cel", plan: 100, actual: 100 },
		]);
	});

	it("reads a bare checkbox as done or not, so no percent has to be typed", () => {
		expect(parseGoals(["- [x] Wydanie 0.3", "- [ ] Dokumentacja"])).toEqual([
			{ name: "Wydanie 0.3", plan: 100, actual: 100, tasks: { done: 1, total: 1 } },
			{ name: "Dokumentacja", plan: 100, actual: 0, tasks: { done: 0, total: 1 } },
		]);
	});

	it("counts sub-tasks as the progress of the goal above them", () => {
		expect(
			parseGoals([
				"- [ ] Wydanie 0.3",
				"    - [x] testy",
				"    - [x] dokumentacja",
				"    - [ ] tag",
				"- [ ] Sprzątanie",
				"    - [x] jedno",
			]),
		).toEqual([
			{ name: "Wydanie 0.3", plan: 100, actual: 67, tasks: { done: 2, total: 3 } },
			{ name: "Sprzątanie", plan: 100, actual: 100, tasks: { done: 1, total: 1 } },
		]);
	});

	it("leaves a dropped sub-task out of the tally instead of counting it as outstanding", () => {
		expect(parseGoals(["- [ ] Cel", "    - [x] zrobione", "    - [-] porzucone"])).toEqual([
			{ name: "Cel", plan: 100, actual: 100, tasks: { done: 1, total: 1 } },
		]);
	});

	it("treats an in-progress sub-task as not done yet", () => {
		expect(parseGoals(["- [ ] Cel", "    - [/] w toku", "    - [x] zrobione"])).toEqual([
			{ name: "Cel", plan: 100, actual: 50, tasks: { done: 1, total: 2 } },
		]);
	});

	it("mixes hand-written percentages and checkboxes in one section", () => {
		expect(parseGoals(["- Dokumentacja :: 40 / 40", "- [x] Wydanie"])).toEqual([
			{ name: "Dokumentacja", plan: 40, actual: 40 },
			{ name: "Wydanie", plan: 100, actual: 100, tasks: { done: 1, total: 1 } },
		]);
	});

	it("ignores a goal whose every sub-task was dropped", () => {
		expect(parseGoals(["- [ ] Cel", "    - [-] jedno", "    - [-] drugie"])).toEqual([]);
	});
});

describe("axisTicks", () => {
	it("never labels two gridlines with the same number", () => {
		for (let max = 1; max <= 200; max++) {
			const ticks = axisTicks(max);
			expect(new Set(ticks).size).toBe(ticks.length);
			expect(ticks.every(Number.isInteger)).toBe(true);
		}
	});

	it("keeps a small axis whole — the case that drew 0, 1, 2, 2, 3", () => {
		expect(axisTicks(3)).toEqual([0, 1, 2, 3]);
		expect(axisTicks(1)).toEqual([0, 1]);
	});

	it("steps by 1, 2, 5 or a power of ten above them", () => {
		expect(axisTicks(6)).toEqual([0, 2, 4, 6]);
		expect(axisTicks(17)).toEqual([0, 5, 10, 15, 20]);
		expect(axisTicks(300)).toEqual([0, 100, 200, 300]);
	});

	it("covers the maximum and never more lines than asked for", () => {
		for (const max of [1, 3, 7, 12, 49, 51, 137, 999]) {
			const ticks = axisTicks(max);
			expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
			expect(ticks.length - 1).toBeLessThanOrEqual(4);
		}
	});
});

describe("trend", () => {
	it("compares the last two buckets", () => {
		expect(trend([2, 4])).toBe(100);
		expect(trend([4, 3])).toBe(-25);
		expect(trend([5, 5])).toBe(0);
	});

	it("has nothing to say about a single bucket or growth from zero", () => {
		expect(trend([7])).toBeNull();
		expect(trend([0, 3])).toBeNull();
		expect(trend([0, 0])).toBe(0);
	});
});

function blank() {
	return { planned: 0, inProgress: 0, done: 0, dropped: 0 };
}

describe("canonical", () => {
	// The canonical spelling is the one the user configured — which is meant to be
	// the name of an EXISTING note, not a prettier rendering of it. Otherwise the
	// link in the sources panel points at nothing.
	const casing = projectCasing(["FooBar", "baz-qux", "mIxed"]);

	it("folds every spelling of a configured project onto one name", () => {
		for (const written of ["FooBar", "foobar", "foo-bar", "FOO BAR", "Foo_Bar"]) {
			expect(canonical(written, casing)).toBe("FooBar");
		}
		expect(canonical("Baz Qux", casing)).toBe("baz-qux");
		expect(canonical("mixed", casing)).toBe("mIxed");
	});

	it("keeps an unconfigured project but capitalises it, so case alone never splits a slice", () => {
		expect(canonical("widgets", casing)).toBe("Widgets");
		expect(canonical("Widgets", casing)).toBe("Widgets");
		expect(canonical("  reports ", casing)).toBe("Reports");
	});

	it("takes every name at its word when nothing is configured", () => {
		expect(canonical("foobar")).toBe("Foobar");
		expect(canonical("FooBar")).toBe("FooBar");
	});

	it("ignores blank lines in the configured list", () => {
		expect(canonical("foobar", projectCasing(["", "  ", "FooBar"]))).toBe("FooBar");
	});

	it("drops empty entries", () => {
		expect(canonical("   ", casing)).toBe("");
	});
});
