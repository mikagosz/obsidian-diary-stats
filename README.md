# Diary Stats

Charts for periodic notes in Obsidian. Drop one code block into a weekly, monthly
or yearly note and it draws what the period actually looked like — from the notes
you already write, with nothing extra to fill in.

```diary-stats
```

## What it draws

| Panel | Reads |
|---|---|
| **Projects** | a donut of which projects the period went into |
| **Activity over time** | sessions per day (per month in a yearly note) |
| **Four weeks** | the month split into its four weeks (monthly notes only) |
| **Tasks** | planned / in progress / done / dropped |
| **Key metrics** | totals with a sparkline and the change against the previous bucket |
| **Goals** | plan against actual — **only if you wrote any** |

Pick a subset with a `panele:` line:

```diary-stats
panele: projekty, zadania
```

## What a note has to say

The block works out the period from the note's own frontmatter, so nothing is
hardcoded and the same block works everywhere:

- weekly note — `od: 2026-08-01` and `do: 2026-08-07`
- monthly note — `miesiac: 2026-08`
- yearly note — `rok: 2026`

Day notes are found by filename: anything starting `YYYY-MM-DD` inside the diary
folder counts, so `2026-08-09 (niedziela).md` works as well as `2026-08-09.md`.

**Sessions** are links to notes named `YYYY-MM-DD-Something`. **Projects** come
from each session note's `dotyczy:` list, falling back to its `projekt/…` tags.

List a project under **Project names** in the settings and every spelling of it
(`FooBar`, `foobar`, `foo-bar`, `FOO BAR`) folds onto the one you wrote, so a
project never splits into two slices. Leave the setting empty — as it ships — and
every note is taken at its word.

**Tasks** use the four standard markers: `- [ ]`, `- [/]`, `- [x]`, `- [-]`.

## Goals are optional

Write a `## Cele` section and the goals panel appears. Leave it out and it does
not — no empty panel, no nagging.

```markdown
## Cele

- Project X v1.5 — offline mode :: 80 / 85
- Documentation :: 40
```

First number is the plan, second what you actually reached. Anything without a
`::` is treated as prose and ignored, so notes can share the section.

## Weeks

Weeks run by day of month — 1–7, 8–14, 15–21, 22–end. Always four, always inside
one month. Calendar weeks straddle month boundaries and would make "four weeks of
August" impossible to draw.

## Settings

Folder names, the goals heading, project names, and how many projects get their
own colour before the rest folds into one slice.

## Language

**The interface is Polish.** Panel titles, month and weekday names, and the block's
`panele:` keywords are all Polish, and the defaults match a Polish vault
(`_Dziennik`, `_Sesje`, `Cele`). The folder names and the goals heading are
settings, so they move; the panel titles do not — not yet.

The frontmatter keys the plugin reads are Polish too: `od:`/`do:`, `miesiac:`,
`rok:`, and `dotyczy:` on a session note.

## Colours

Light and dark are two selected palettes, not one flipped. Both were checked for
colour-vision separation and contrast against the surface they render on. If you
reorder the slots in `styles.css`, re-run that check — adjacency is what the
validation was done against.

## Licence

MIT.
