# Vantillu — implementation guide

Local-first cooking log and suggestion engine. React Native via Expo, targeting Android
and iOS from one codebase. Android ships first.

This document is the build plan. Work through the phases in order; each one ends in a
commit that leaves the app runnable.

> **`docs/SPEC.md` supersedes this file on product decisions** — roles, weights, windows,
> thresholds, and the prep model. The code snippets below are illustrative sketches, and
> three of them are now known to be wrong; each is flagged inline. Read the SPEC before
> copying any snippet from §4 or §5.

---

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Expo (React Native), TypeScript strict | One codebase, both platforms, no Xcode needed for most work |
| Navigation | `expo-router` | File-based routing — same mental model as Next.js App Router |
| Database | `expo-sqlite` | On-device, synchronous-capable, no server |
| ORM | Drizzle ORM + drizzle-kit | Typed schema and real migrations; closest thing to TypeORM in RN |
| Reactivity | Drizzle `useLiveQuery` | Queries re-run on write automatically — no manual cache invalidation |
| Styling | `StyleSheet` + a tokens module | Zero Metro/Babel risk; the design is token-driven anyway |
| Icons | `lucide-react-native` | Matches the mockup's line weight |
| Fonts | `expo-font` + `@expo-google-fonts/*` | Familjen Grotesk + DM Mono |
| Dates | `date-fns` | Tree-shakeable interval math |
| Notifications | `expo-notifications` | Local-only prep-ahead nudges |
| Tests | Vitest | Runs the pure core in plain Node, fast |
| Lint/format | Biome | One tool, one config, faster than ESLint + Prettier |
| Builds | EAS Build | Cloud builds, including iOS from Windows |

### Deliberately not used

- **NativeWind.** You know Tailwind, so it's tempting, but it adds a Metro/Babel
  transform that breaks on Expo SDK upgrades. The palette is six colours and the type
  scale is five sizes — a tokens file is less code and can't break.
- **No backend, no auth, no sync.** Local SQLite plus JSON export. Adding a server
  triples the surface area and this app has one user.
- **No Redux/Zustand.** `useLiveQuery` plus local component state covers everything.
  Add a store only if you find yourself passing props four levels deep.
- **No structured recipe ingredients.** Free text for v1. A parser for real cooking
  units ("a small piece of jaggery", "4 whistles") is weeks of work and buys nothing
  until you need shopping lists.

---

## 2. Repo setup

```bash
npx create-expo-app@latest vantillu --template default
cd vantillu
git init && git add -A && git commit -m "chore: scaffold expo app"
```

### Dependencies

```bash
# database
npx expo install expo-sqlite
npm i drizzle-orm
npm i -D drizzle-kit babel-plugin-inline-import

# ui
npm i lucide-react-native
npx expo install react-native-svg
npx expo install expo-font @expo-google-fonts/familjen-grotesk @expo-google-fonts/dm-mono

# platform
npx expo install expo-notifications expo-file-system expo-sharing expo-document-picker
npm i date-fns

# tooling
npm i -D vitest @biomejs/biome
npx biome init
```

Two more are missing (`docs/SPEC.md` §13). **`expo-crypto` is needed in Phase 1** — every
primary key is now a `randomUUID()`, so the schema depends on it. `expo-image-picker` can
wait for Phase 6.

The scaffold command above assumes an empty parent directory. This repo *is* `vantillu`
and already holds `CLAUDE.md`, `docs/`, and `assets/` — scaffold into a temp directory and
copy the app files in, or use `npx create-expo-app@latest .` and keep the existing files.

### The three config files Drizzle needs

This is the single most common place to get stuck. All three are required.

**`babel.config.js`**
```js
module.exports = (api) => {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
```

**`metro.config.js`**
```js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql');
module.exports = config;
```

**`drizzle.config.ts`**
```ts
import type { Config } from 'drizzle-kit';
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config;
```

Generate migrations with `npx drizzle-kit generate`. They are applied at runtime by the
`useMigrations` hook in the root layout — not by a CLI push.

### Development build, not Expo Go

Expo Go can't run local notifications on Android and won't include custom native config.
Build a dev client once and reuse it:

```bash
npx expo install expo-dev-client
eas build --profile development --platform android
```

Install the resulting APK on your phone, then `npx expo start --dev-client` for daily work.

---

## 3. Structure

```
vantillu/
├── app/                          # expo-router — screens only, thin
│   ├── _layout.tsx               # migrations, fonts, theme provider
│   ├── (tabs)/
│   │   ├── _layout.tsx           # bottom tab bar
│   │   ├── index.tsx             # Today
│   │   ├── dishes.tsx            # repertoire list
│   │   └── insights.tsx          # Phase 11 — no tab until it exists
│   ├── dish/[id].tsx             # detail: pattern stats, then recipe + timeline in Ph 7
│   ├── dish/edit/[id].tsx        # add/edit dish + recipe
│   ├── log.tsx                   # log sheet — one route, ?dishId skips the picker
│   └── debug.tsx                 # dev tools — dies with Phase 9
│                                 # no onboarding route: Ph 8 made it a gate, see §18.4
├── src/
│   ├── core/                     # PURE TS — no react, no react-native imports
│   │   ├── interval.ts           # median interval, staleness ratio
│   │   ├── scoring.ts            # eligibility, score, reasons
│   │   ├── slots.ts              # hour → meal slot, time budgets
│   │   ├── prep.ts               # prep shelf life
│   │   └── types.ts
│   ├── db/
│   │   ├── schema.ts
│   │   ├── client.ts
│   │   ├── queries/              # these import `db` — tables.ts is one read per table
│   │   ├── rows.ts               # row shapes + TEXT → core union narrowing. No `db`.
│   │   ├── todayModel.ts         # rows + `now` → Candidate/Context. No `db`, no clock.
│   │   ├── dishesModel.ts        # rows + `now` → the repertoire list. No `db`, no clock.
│   │   ├── cookModel.ts          # log sheet + `now` → a cook_event row. No `db`, no clock.
│   │   ├── onboardingModel.ts    # picker + buckets → estimated events. No `db`, no clock.
│   │   ├── seedCatalog.ts        # seed_dishes.json → dish rows. No `db`, no crypto.
│   │   ├── settings.ts           # how setting values are read. No `db`.
│   │   └── seed.ts               # first-run role_config only, since Phase 8
│   ├── components/
│   ├── screens/                  # Onboarding — the one screen that is not a route
│   ├── hooks/
│   └── theme/tokens.ts
├── drizzle/                      # generated migrations — commit these
├── assets/
│   └── seed_dishes.json
├── __tests__/                    # vitest — src/core, plus the pure src/db models
├── CLAUDE.md                     # conventions — loaded every session
└── docs/
    ├── SPEC.md                   # product decisions — authoritative
    ├── IMPLEMENTATION.md         # this file
    └── vantillu-mockup.html      # visual reference + scoring sketch
```

### The one architectural rule that matters

**`src/core/` must not import React, React Native, or the database.** Pure functions
over plain objects. Everything correctness-critical lives there, so it can be unit
tested in Node in milliseconds without a simulator. If you find yourself wanting to
import `expo-sqlite` into `core/`, the function belongs in `db/queries/` instead.

---

## 4. Schema

Changes from the earlier draft: `prep` enum replaced by `prep_lead_hours` + `prep_label`
(generalises soaking, fermenting, marinating, thawing), recipe fields added, `role` is
unconstrained text.

> **Amendments required in Phase 1.** The snippet below is out of date in five ways. All
> of them land in Phase 1 so that no later migration is needed.
>
> *Correctness — without these, `isEligible`'s `livePrep` check cannot be computed at all,
> because `prep_state` as drafted has no link to any dish (`docs/SPEC.md` §5.1):*
>
> - add `dish.prep_kind` — TEXT nullable: `batter` | `soaked` | `marinated`
> - add `prep_state.ingredient` — TEXT nullable; live prep matches on the
>   `(kind, ingredient)` pair
> - add a `role_config` table — `role` PK, `label`, `is_always_available`, `sort_order`
>
> *Future-proofing — cheap now, expensive to retrofit (`docs/SPEC.md` §11). Multi-user is
> **not** in scope; these only keep the door open:*
>
> - **every `id` becomes `text('id').primaryKey()`** holding a v4 UUID from `expo-crypto`,
>   not `integer().primaryKey({ autoIncrement: true })`. Two devices would otherwise both
>   mint `dish.id = 7`.
> - **every table gains `updated_at` and `deleted_at`** (TEXT, local ISO; `deleted_at`
>   nullable). Deletes are soft, queries filter `deleted_at IS NULL`. Added later, every
>   pre-existing deletion is unrecoverable.
>
> Also: `cooked_at` stores a full **local** ISO datetime, not a date-only string
> (`docs/SPEC.md` §2.1).

```ts
// src/db/schema.ts
import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

export const dish = sqliteTable('dish', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  altName: text('alt_name'),                    // "also called" — regional names
  role: text('role').notNull(),                 // free text, seeded with defaults
  primaryIngredient: text('primary_ingredient'),
  effort: text('effort').notNull(),              // instant | quick | medium | project
  minutes: integer('minutes'),
  isVeg: integer('is_veg', { mode: 'boolean' }).notNull().default(true),
  prepLeadHours: integer('prep_lead_hours'),     // 8 = soak, 12 = ferment, 2 = marinate
  prepLabel: text('prep_label'),                 // "soak overnight", "grind and ferment"
  usesLeftoverRice: integer('uses_leftover_rice', { mode: 'boolean' }).notNull().default(false),
  isFestive: integer('is_festive', { mode: 'boolean' }).notNull().default(false),
  season: text('season'),
  ingredientsText: text('ingredients_text'),     // free text recipe
  methodText: text('method_text'),
  notes: text('notes'),                          // stable notes about the dish
  source: text('source'),                        // "Amma", a URL, a cookbook
  isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

export const dishSlot = sqliteTable('dish_slot', {
  dishId: integer('dish_id').notNull().references(() => dish.id, { onDelete: 'cascade' }),
  slot: text('slot').notNull(),                  // breakfast | lunch | dinner | snack
}, (t) => ({ pk: primaryKey({ columns: [t.dishId, t.slot] }) }));

export const cookEvent = sqliteTable('cook_event', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dishId: integer('dish_id').notNull().references(() => dish.id, { onDelete: 'cascade' }),
  cookedAt: text('cooked_at').notNull(),         // ISO date
  slot: text('slot').notNull(),
  mealId: text('meal_id'),                       // shared across dishes cooked together
  rating: integer('rating'),                     // 1 | 2 | 3
  tweakNote: text('tweak_note'),                 // per-cook observation
  photoUri: text('photo_uri'),
  isBatch: integer('is_batch', { mode: 'boolean' }).notNull().default(false),
  isEstimated: integer('is_estimated', { mode: 'boolean' }).notNull().default(false),
});

export const prepState = sqliteTable('prep_state', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(),                  // batter | soaked | marinating
  label: text('label'),
  readyAt: text('ready_at'),
  expiresAt: text('expires_at'),
});

export const setting = sqliteTable('setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
```

Derived values (`daysSince`, `medianInterval`, `cookCount`) are **never stored**. At
60 dishes they compute in under a millisecond and cached columns always drift.

---

## 5. The core module

This is the only genuinely fiddly logic. Write it first, test it, then build UI on top.

```ts
// src/core/interval.ts
export function intervals(sortedDatesDesc: Date[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < sortedDatesDesc.length - 1; i++) {
    const d = (sortedDatesDesc[i].getTime() - sortedDatesDesc[i + 1].getTime()) / 86400000;
    out.push(Math.round(d));
  }
  return out;
}

/** Median of the last 5 intervals. null when there isn't enough history to be honest. */
export function medianInterval(sortedDatesDesc: Date[]): number | null {
  const iv = intervals(sortedDatesDesc).slice(0, 5);
  if (iv.length < 2) return null;              // needs 3+ cooks
  const s = [...iv].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function staleness(daysSince: number, median: number | null): number {
  return median ? daysSince / median : 1;      // unknown → neutral
}
```

Median, not mean — one six-week travel gap would otherwise convince the app you make
tamarind rice twice a year.

```ts
// src/core/scoring.ts
import type { Candidate, Context } from './types';

export function isEligible(d: Candidate, ctx: Context): boolean {
  if (d.isArchived) return false;
  if (d.role === 'podi' || d.role === 'accompaniment') return false;  // always available
  if (!d.slots.includes(ctx.slot)) return false;
  if (!ctx.budget.includes(d.effort)) return false;
  if (d.prepLeadHours && !ctx.livePrep.includes(d.id)) return false;
  if (!d.isVeg && ctx.isVegOnlyDay) return false;
  return true;
}

export function score(d: Candidate, ctx: Context): number {
  let s = staleness(d.daysSince, d.median);
  if (ctx.budget.indexOf(d.effort) < 2) s += 1.5;
  if (d.usesLeftoverRice && ctx.riceYesterday) s += 1.2;
  if (d.prepLeadHours && ctx.prepExpiringSoon.includes(d.id)) s += 1.0;
  if (d.season === ctx.season) s += 0.8;
  if (ctx.recentIngredients.includes(d.primaryIngredient)) s -= 4.0;
  if (ctx.rolesFilledByBatch.includes(d.role)) s -= 2.0;
  if (d.lastRating === 1) s -= 1.5;
  return s;
}
```

**Keep the random jitter out of `score()`.** Apply it in the caller, or the function
stops being deterministic and can't be unit tested.

> **Two bugs in the sketch above** (`docs/SPEC.md` §1.1, §4.4):
>
> 1. `d.role === 'podi' || d.role === 'accompaniment'` hard-codes role names that the user
>    can rename. Use `d.isAlwaysAvailable`, resolved from `role_config` by the query layer.
> 2. `ctx.budget.indexOf(d.effort) < 2` depends on budget arrays being sorted ascending,
>    and returns `-1` — also `< 2` — for an effort outside the budget, so an ineligible
>    dish collects the bonus. Use `effortRank(d.effort) <= 1` against the fixed rank table.
>
> Both need a regression test in Phase 2, including one that calls `score()` on a
> candidate that fails `isEligible()`.

### Tests that must exist

```
medianInterval: 2 cooks → null
medianInterval: [30,3,3,3] day gaps → returns 3, not the mean
isEligible: ferment dish with no live batter → false
isEligible: non-veg on a veg-only day → false
isEligible: project dish on a weekday breakfast → false
score: primary ingredient cooked yesterday ranks below a stale dish
score: identical inputs → identical output (deterministic)
```

That last one catches the jitter mistake. Four more, added by `docs/SPEC.md`:

```
medianInterval: median of 0 (two cooks same day) → treated as unknown, no divide-by-zero
medianInterval: isEstimated events excluded from interval math, counted in daysSince
isEligible: always-available role excluded via the flag, not via a role string
score: called on a candidate that fails isEligible → no effort-fit bonus
```

---

## 6. Phases

Each phase is one Claude Code session and one commit. Don't run ahead — verify each on
device before moving on.

### Phase 0 — scaffold
Expo app, TypeScript strict, Biome, the three Drizzle config files, dev build installed
and launching on your phone. Nothing else.
**Done when:** `npx expo start --dev-client` opens a blank screen on your device.

### Phase 1 — database
Schema, `drizzle-kit generate`, `useMigrations` in the root layout, seed loader reading
`assets/seed_dishes.json`, a debug screen listing dish names from the DB.
**Done when:** the seeded dish count renders on screen and survives an app restart.

### Phase 2 — core + tests
`src/core/*` and the full Vitest suite. No UI work at all in this phase.
**Done when:** `npx vitest run` is green and coverage of `src/core` is above 90%.

### Phase 3 — theme and shared components
`tokens.ts` from the mockup palette, fonts loaded, then `IntervalGauge`, `ReasonChip`,
`DishCard`. Build these in isolation on a scratch screen.

Dark mode landed here too, reversing `docs/SPEC.md` §12 — see §14 for the rules. It means
both palettes live behind one `Palette` interface and **`StyleSheet.create` never runs at
module scope**; styles come from `useThemedStyles(makeStyles)`. Doing it in this phase
rather than later is the whole point: the theme is three components wide right now.

**Done when:** a gauge renders correctly at ratios 0.3, 1.0, 1.6, and null — in both
schemes. The scratch screen renders the gallery twice, once pinned to the scheme the device
is not in, so flipping the system setting is not needed to check either one.

### Phase 4 — Today screen
Slot auto-detection with manual override, live suggestions, prep banner, "held back"
explainer, FAB.
**Done when:** changing device time from morning to evening changes the suggestions.

Two things landed here that the sketch above does not name.

**The queries carry no timestamps.** Six small `useLiveQuery` reads over whole tables, then
one pure function — `src/db/todayModel.ts` — turns rows plus a ticking `now` into
`Candidate` and `Context`. A `WHERE cooked_at > ?` would have to be rebuilt and resubscribed
every minute, remounting the list each time. It also keeps the median in `src/core/` where
it is tested, rather than in SQL where it would not be. The clock itself is `useNow`, which
ticks once a minute *and* on app foreground — an interval alone does not fire while
backgrounded, so a phone left overnight would wake to yesterday's slot.

**`todayModel.ts` imports neither `db` nor a clock**, which is the whole reason it is a
separate module from `queries/today.ts`. Every window in SPEC §4.3 and every prep rule in
§5.2 is applied there, so all of it is unit tested in Node — including an end-to-end pass
over the real `assets/seed_dishes.json`, which is what catches the seed and the engine
drifting apart. Do the same for any later screen whose data needs real logic.

The FAB is present but inert until Phase 6, and `app/debug.tsx` grew three buttons that
write `prep_state` rows, because Phase 9 owns the only real writer and the prep banner would
otherwise be unverifiable code.

### Phase 5 — Dishes list and detail
Staleness-sorted list, role filters, search, detail screen with pattern stats.
**Done when:** you can navigate list → detail → back with state preserved.

The tab bar landed here, since this is the first phase with a second place to go. **Two
tabs, not the mockup's three** — Insights is Phase 11 and cuttable, and a tab that opens
nothing is worse than a tab that isn't there yet.

State preservation is structural rather than something to remember: the role filter and the
search live in the `dishes.tsx` component, and the detail screen is *pushed over* the tab
group rather than swapped into it, so the list stays mounted with its scroll position. Put
that state in `useDishes` and it would reset on every back.

`src/db/rows.ts` came out of `todayModel.ts` when the second screen arrived: row shapes plus
the TEXT-to-union narrowing, shared. Each `as*` function encodes a decision about what a bad
value *means*, and two copies of those decisions would eventually disagree. Same reason
`queries/today.ts` became `queries/tables.ts` — those reads are per table, not per screen,
and the dishes list wants four of the same six.

`src/db/dishesModel.ts` is a sibling of `todayModel.ts`, not a slice of it. Today drops
everything ineligible; the repertoire keeps a podi, because it is a dish you own — it is
simply never *suggested* (`docs/SPEC.md` §1.1). See SPEC §15 for the sort, which is three
bands rather than one ratio.

Phase 3's `app/scratch.tsx` is gone, as its own comment promised. `app/debug.tsx` lost its
dish list to the real Dishes tab and kept only the prep writer Phase 9 will replace.

### Phase 6 — logging
The log sheet: dish picker, slot, 3-point rating, tweak note, batch toggle,
"add another dish to this meal" writing a shared `mealId`.
**Done when:** logging a cook updates that dish's gauge on the Today screen immediately.

**Hard rule 6 needed a reading, and `docs/SPEC.md` §16.1 now records it.** "One tap from
Today" is about the *entry*: a suggestion card or a dish's **Log a cook** opens the sheet
straight on the form, and the dish picker appears only for the FAB, which is the one caller
that does not know the dish. Nothing may ever be inserted before that form on a path where
the dish is already known.

**One route, `app/log.tsx`, not the `log/[dishId].tsx` sketched in §3.** "Add another dish to
this meal" has to carry a `mealId` across a return to the picker, and threading that through
route params to a second screen puts the meal grouping in the navigator instead of in one
component. `?dishId=` skips the picker; `?slot=` carries the slot being *browsed*, which is
not the clock while Today's override is in force.

Presented with `presentation: 'formSheet'` — a native bottom sheet on both platforms in
react-native-screens 4, so Today stays visible behind it. **This is the part most worth
looking at on device**; the detents are a guess.

The acceptance criterion needs no invalidation code. `useLiveQuery` re-runs on any write to
`cook_event`, and every derived value is computed on read (hard rule 2), so the gauge simply
moves. What *is* tested in Node is the write/read round trip — `toCookEventRow` output fed
back through both screen models — because `NewCookEventRow` is a structural superset of
`CookEventRow`, so a wrong `cookedAt` format would compile and silently never parse.

### Phase 7 — recipes and notes
Recipe view and editor (free text ingredients + method), dish notes, and the cook-note
timeline on the detail screen. Empty states must be inviting, never nagging.
**Done when:** a dish with no recipe looks intentional rather than broken.

**Smaller than the line above implies**, because the cook-note timeline was pulled forward
into Phase 6 (SPEC §16.5) — Phase 6 shipped note capture, and text that vanishes on save
reads as a bug however the roadmap is written. What was left is the recipe and `dish.notes`.
SPEC §17 records the product decisions.

**The route is the sketched `dish/edit/[id].tsx`, editing less than §3 promised.** That line
says "add/edit dish + recipe"; this phase owns the recipe and the notes, so that is all it
edits. The dish's identity — name, role, effort, slots — is not editable anywhere yet, and
there is still no path that *adds* a dish, so an editor that also renamed things would be
half of a screen nobody can reach the other half of. Whenever those fields arrive they widen
this route rather than needing another one.

**Ingredients and method are stored as two blobs and rendered as a list and paragraphs.**
Splitting on newlines and blank lines is presentation, not storage, so it sits in
`src/db/dishModel.ts` — the sibling of `cookModel.ts`, pure and with no clock — where "a
bullet the user typed themselves is stripped rather than rendered twice" is an assertion
instead of something to notice later. `dishModel.ts` also owns `hasRecipeEdits`, which is
what makes the discard confirmation fire only when there is something to lose.

**The editor is the one screen holding text that exists nowhere else**, so leaving it with
unsaved edits asks first. That needed both halves: `gestureEnabled: false` in the root layout,
since iOS's swipe-back pops a screen with no chance to intervene, and a `BackHandler`
intercept in the screen for Android's hardware back. `usePreventRemove` would have covered
both, and expo-router 57 no longer re-exports React Navigation, so it is not available.

**The editor has no `KeyboardAvoidingView`**, because on Android it did nothing and the Notes
field — the last one on the screen — typed itself under the keyboard. See §7: it is a
platform fact rather than anything about this screen, and `src/hooks/useKeyboardInset.ts`
carries the explanation.

Two smaller things. `dishesQuery()` now also selects `dish.notes`, which looks like the
mistake `cookEventsForDishQuery` exists to avoid and isn't: the cook log grows a row per meal
forever, while the dish table is bounded by the size of a repertoire, and `hasRecipe` reads
those columns on every screen anyway. And `TextField` came out of the log sheet when the
count went from one multiline input to four — mostly for `placeholderTextColor`, which
`TextInput` otherwise defaults to a grey that disappears against a dark surface.

### Phase 8 — onboarding
An intro that explains the app, then an optional starter list.
**Done when:** a fresh install reaches a useful Today screen in under three minutes.

**The line above is not what this phase originally said**, and the difference is the phase's
main lesson. It read "seed picker, then the last-cooked estimate buckets writing `isEstimated`
events" — both of which got built and then cut on the author's reading of the result. SPEC §18
is authoritative; the short version is that onboarding's job is **to explain the app**, and
both of those turned it into a data-entry chore standing between someone and the thing they
just installed.

**The seed stopped loading itself.** Phase 1's `seedDatabaseIfEmpty` inserted all sixty-eight
dishes on first launch. So `seed.ts` now seeds `role_config` alone — configuration, needed by
every screen — and dishes are inserted by `queries/onboarding.ts` from what the user ticked.

**Then the pre-ticking went too.** The first version offered the list with everything ticked,
to untick from. Quieter than Phase 1 and the same mistake: tapping Continue is what most
people do, so the default *is* the outcome, and the default was a stranger's repertoire. It is
now offered with **nothing ticked**, clearly optional, and skipping it is the expected path —
dishes are added by hand from the Dishes tab, which is what §19 exists for.

**And the estimate buckets went.** They asked, per dish, roughly when you last cooked it, and
wrote an `isEstimated` event. The honest accounting was already thin — those events are
excluded from interval maths, so no number of them makes a median, and an unknown median
scores a neutral 1.0, so the suggestion order never moved. `is_estimated` stays in the schema
and stays excluded from the median; nothing writes one now (SPEC §18.3).

**The mapping moved to `src/db/seedCatalog.ts` and is now pure.** That was the enabling change
rather than tidying: the starter list renders the catalogue before any of it is in the
database, and `__tests__/seedPipeline.test.ts` had been keeping a hand-copied duplicate of the
mapping — the one test whose job is to catch seed drift was itself a second copy that could
drift. It calls the real mapper now.

**Onboarding is a gate, not the `app/onboarding.tsx` route sketched in §3.** It renders in
place of the `Stack`, beside the migration gate and the boot failure, because either there is
a repertoire or there is not — a route would need a redirect that flashes Today first, or a
navigator guard holding every other route out of reach. `useOnboardingGate` is live, so
committing the writes is what dismisses it. It needs *both* the `onboardedAt` marker and an
empty dish table, or the author's Phase-1 install would be asked to onboard and anyone who
picked nothing would be asked forever (§18.4).

`app/debug.tsx` grew a **Reset onboarding** button, for the same reason it grew the prep
writers: this is the one flow whose acceptance criterion is a stopwatch, and without a reset
there is no way to see it twice short of uninstalling. It hard-deletes, unlike every other
delete in the app — a reset that left sixty-eight tombstones behind would not be the fresh
install it claims to be.

**Adding a dish had to follow immediately, in the same session.** Phase 7 recorded that the
dish's identity was not editable and that nothing *added* a dish; that was survivable while
first launch inserted all sixty-eight. Once the seed became a list you pick from it was not,
and once the list stopped being pre-ticked the editor became the **primary** way a repertoire
gets built rather than a fallback. So
`dish/edit/[id].tsx` widened to the "add/edit dish + recipe" that §3 always sketched, with
`id = new` for a dish that does not exist yet, and a soft delete at the bottom of it. SPEC
§19 has the field list and the two required fields; the short version is that a dish with no
meal slot fails a *silent* eligibility filter and is invisible forever, so that is the one
thing besides a name the form will not let you skip.

Adding is a **FAB on the Dishes tab**, matching Today's — each tab has exactly one thing
worth adding, so one glyph carries both. It was a small button in the header first, which
was wrong twice over: the header says what a screen is rather than what to do on it, and a
text button up there reads as incidental beside a full-screen list.

### Phase 9 — prep notifications
`expo-notifications`, local only. Schedule a nudge `prepLeadHours` before the dish's
usual slot. Manage `prepState` lifecycle: created, ready, expired.
**Done when:** a 9pm soak reminder fires for an overdue dish that needs one.

### Phase 10 — export/import
JSON export via `expo-sharing`, import via `expo-document-picker`. See `docs/SPEC.md` §10:
the export is a **versioned envelope**, a WAL checkpoint runs first, import is replace-all
behind a confirmation, tombstones ship with the data, and photos are references — text
round-trips losslessly, photo URIs will dangle after a device move, and the UI says so.
**Done when:** export, wipe the app, import, and every gauge reads the same as before.

### Phase 11 — Insights
Cooks per week, most/least cooked, repertoire coverage by primary ingredient.
Lowest priority — cut it if you're losing momentum.

### Phase 12 — Android release
See section 8.

---

## 7. Cross-platform discipline

You'll only be testing on Android for months, so iOS bugs accumulate silently. Rules
that prevent the worst of it:

- Wrap every screen in `SafeAreaView` from `react-native-safe-area-context`, not the
  React Native one. iOS notch and Android status bar differ.
- Never hard-code `elevation` (Android-only) or `shadow*` (iOS-only) alone — use
  `Platform.select` or a shared `card` token that sets both.
- Fonts render ~1px larger on Android at the same `fontSize`. Don't pixel-tune to Android.
- **`KeyboardAvoidingView` does nothing on Android in this SDK.** The advice this line used
  to give — `padding` on iOS, `height` on Android — assumed the window resizes when the
  keyboard opens. Edge-to-edge is mandatory from Android 16 and Expo SDK 57 removed the
  opt-out, and an edge-to-edge window does not resize, so `windowSoftInputMode="adjustResize"`
  is inert and there is no inset for `KeyboardAvoidingView` to mirror. It fails silently: the
  last field on the screen sits under the keyboard, which is invisible until someone types in
  it. Phase 7's recipe editor hit exactly that.
  React Native still *reports* the keyboard, from `WindowInsetsCompat.Type.ime()` rather than
  from a resize, so `src/hooks/useKeyboardInset.ts` has a trustworthy height on both
  platforms. The response has to be written in JS: add the inset as scrollable room, then
  scroll the focused field to the top of what is left. Both halves are needed — shrinking the
  viewport alone leaves the scroll offset where it was and the field below the fold.
- Local notification permissions differ: Android 13+ needs `POST_NOTIFICATIONS` at
  runtime, iOS needs an explicit request. Handle both in Phase 9 even though you can't
  test iOS yet.
- `useColorScheme()` only reports `dark` on iOS when `app.json` sets `userInterfaceStyle`
  to `automatic`. It is set, but a plugin or a config edit can quietly drop it, and the
  symptom — an iPhone stuck in light mode — is invisible from Android.
- Run `npx expo-doctor` before each release.

**Do not build widgets yet.** Android app widgets need Kotlin, iOS needs WidgetKit and
Swift. Two separate native implementations. Revisit only once daily logging has stuck.

---

## 8. Release

### Android first

```bash
npm i -g eas-cli && eas login
eas build:configure
eas build --profile production --platform android
```

Then in Play Console (₹/$25 one-time):

1. Create the app. Package ID `com.vantillu.app` is permanent — set it once.
2. Upload the AAB to the **Internal testing** track.
3. Add yourself as a tester. Install from the opt-in link.

Internal testing is the right home for this app indefinitely. It gives you Play-delivered
automatic updates without a public listing, without store review, and without the
12-testers-for-14-days requirement that gates production access for personal accounts
created after November 2023.

Only if you later want a public listing do you need a privacy policy URL — free on
GitHub Pages — and the closed-testing gauntlet.

### iOS later

Requires the Apple Developer Program at $99/year. From Windows you can still run
`eas build --platform ios` in the cloud, then distribute to your own iPhone via
TestFlight. You cannot run the iOS simulator without macOS, so budget for a round of
layout fixes when you first see it on a real device.

---

## 9. Driving Claude Code

- Keep `CLAUDE.md` in the repo root. It's read automatically every session — that's
  where conventions live, not in your prompts.
- **One phase per session.** Start with "read CLAUDE.md and docs/SPEC.md, then implement
  Phase 4." Long sessions drift.
- Ask for the test first in Phase 2. Once `src/core` is locked and green, later phases
  can't silently break the scoring.
- Commit at every phase boundary with a conventional message (`feat:`, `fix:`, `chore:`).
  A phase that isn't committed will get half-rewritten by the next session.
- When a phase produces something you dislike on device, fix it in that session. Carrying
  UI debt forward is what makes RN projects stall.
