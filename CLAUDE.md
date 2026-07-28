# CLAUDE.md

## What this app is

Vantillu is a local-first cooking log for a single user. It answers one question:
**"what should I cook right now?"** — from the user's own repertoire, ranked by their own
cook history and the current time of day.

It is **not** a recipe database, a meal planner, a nutrition tracker, or a social app.
When a feature request could push it toward any of those, say so before implementing.

Full build plan: `docs/IMPLEMENTATION.md`. Product decisions: `docs/SPEC.md`.

## Stack

Expo (React Native) · TypeScript strict · expo-router · expo-sqlite · Drizzle ORM ·
StyleSheet + `src/theme/tokens.ts` · lucide-react-native · date-fns · Vitest · Biome

Targets Android and iOS from one codebase. Android ships first. Development happens on
Windows/WSL, so **iOS cannot be tested locally** — never assume the author has verified
anything on iOS.

## Hard rules

1. **`src/core/` is pure TypeScript.** No React, no React Native, no database imports.
   Pure functions over plain objects. If a function needs the DB, it belongs in
   `src/db/queries/` instead.
2. **Never store derived values.** `daysSince`, `medianInterval`, and `cookCount` are
   always computed. No cache columns — they drift.
3. **Median, not mean**, for all interval math. Under 3 cook events, return `null` and
   render "new dish" rather than inventing a number.
4. **`score()` must be deterministic.** Any random jitter goes in the caller.
5. **No browser storage APIs, no backend, no auth, no sync.** Local SQLite only.
6. **Logging a cook is one tap from the Today screen.** Never add a step to that path.
7. Migrations are generated (`npx drizzle-kit generate`) and committed. Never hand-edit
   files in `drizzle/`.
8. Cross-platform: `SafeAreaView` from `react-native-safe-area-context`, never bare
   `elevation` or `shadow*` alone, always `Platform.select` or a shared token.

## Domain vocabulary

Dishes have a **role**: `staple`, `tiffin`, `dal`, `dry_curry`, `gravy`, `one_pot`,
`pachadi`, `podi`, `accompaniment`, `snack`, `sweet`. `role` is unconstrained TEXT —
seeded with defaults, editable later. Don't add a CHECK constraint.

- `staple` (plain rice, chapati) and `one_pot` (pulihora, biryani) are **distinct roles**.
  Don't merge them into a `rice` role — the leftover-rice boost fires from `staple` and
  lands on `one_pot`.
- `podi` and `accompaniment` are **always available**: never suggested, never stale,
  excluded from scoring entirely. This is driven by an `isAlwaysAvailable` flag in
  `role_config`, **never by testing for those two role strings** — roles are renameable.
- **Tiffin is valid for breakfast AND dinner.** This is why `dish_slot` is many-to-many.
  Do not collapse it to a single column.
- `prepKind` + `prepLeadHours` + `prepLabel` generalise soaking, fermenting, and
  marinating. Live prep is matched on `(prepKind, primaryIngredient)`, so one batter row
  covers idli/dosa/uttapam but not pesarattu. A dish with `prepKind` and no matching live
  `prepState` row is **hard-excluded** — suggesting dosa with no batter is worse than
  suggesting nothing.
- `usesLeftoverRice` dishes get a boost when a rice staple — `role='staple'` **and**
  `primaryIngredient='rice'` — was logged in the last 24h.

### Three distinct kinds of note — keep them separate

| Field                            | Lives on    | Changes    |
| -------------------------------- | ----------- | ---------- |
| `ingredientsText` / `methodText` | `dish`      | rarely     |
| `notes`                          | `dish`      | rarely     |
| `tweakNote`                      | `cookEvent` | every cook |

`tweakNote` is per-event on purpose. The chronological sequence of tweaks is what
becomes the user's real recipe. Never fold them into the dish record.

## Suggestion logic

Hard filters first, then weighted score. Both live in `src/core/scoring.ts`.
**`docs/SPEC.md` is authoritative for every threshold, weight, and time window** — this
section is the summary, not the source.

Filters: archived · always-available roles · wrong slot · effort over slot budget ·
prep not ready · non-veg on a veg-only day.

Score: staleness ratio, plus bonuses for effort fit, leftover rice, expiring prep, and
season match; minus 4.0 if the primary ingredient was used in the last 2 days, minus 2.0
if the role was filled by a batch cook, minus 1.5 if last rated 1.

Effort comparisons use the fixed rank table in `docs/SPEC.md` §1.2. Never rank effort by
its position in a budget array — `indexOf` returns `-1` for an effort outside the budget,
which silently reads as "very quick".

**Every suggestion shown in the UI must display its dominant reason as a chip.** A
suggestion without a stated reason gets ignored. When the engine excludes something the
user would expect to see, the Today screen says so in the "held back" section — silent
omissions read as bugs.

## UI conventions

Design tokens are in `src/theme/tokens.ts`; reference `docs/vantillu-mockup.html` for the
intended look. Brushed-steel neutrals, with turmeric / gongura-red / curry-green accents
derived from food. Deliberately **not** warm cream and terracotta.

**Light and dark, following the OS** (`docs/SPEC.md` §14). There is no in-app theme setting.

- `tokens.ts` is the **only** file allowed to contain a hex literal. Both palettes live
  there behind one `Palette` interface.
- Colours are named by role, never by appearance. The `steel` surfaces are ordered by
  prominence: light → lighter in light mode, dark → lighter after dark. Picking a token
  because it "looks light enough" inverts wrongly in the other scheme.
- **Never call `StyleSheet.create` at module scope** — it captures one palette forever.
  Write `const makeStyles = ({ colors, text }: Theme) => ({ … })` at module scope and
  `const styles = useThemedStyles(makeStyles)` in the component.
- The mockup is light-only and stays authoritative for light. Dark is designed, so a new
  colour needs a contrast check in both schemes: 4.5:1 for body text, 3:1 for graphics.
  Three *existing* light values miss those floors and are knowingly left alone —
  `docs/SPEC.md` §14.3.1. Don't "fix" them in passing, and don't add a fourth.

- Ratings are 3-point: not again / fine / make again. Never 5 stars.
- The interval gauge fills toward the median; the hairline marks "due"; overdue overflows
  in red; unknown median renders as a hollow dashed bar.
- Empty states are inviting, never nagging. A dish with no recipe is a normal dish, not
  an incomplete one. No completion meters on data entry.

## Commands

```bash
npx expo start --dev-client     # daily dev (dev build required, not Expo Go)
npx vitest run                  # unit tests — src/core only
npx drizzle-kit generate        # after any schema.ts change
npx biome check --write .       # lint + format
npx expo-doctor                 # before any release build
eas build -p android --profile production
```

## Working style

One phase per session, per `docs/IMPLEMENTATION.md`. Commit at each phase boundary using
conventional commits (`feat:`, `fix:`, `chore:`, `test:`). Don't start the next phase in
the same session.

Write the test before the implementation for anything in `src/core/`.
