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
   `src/db/` is split the same way one level down: **`src/db/queries/` imports `db`;
   modules at the `src/db/` root do not** (`time.ts`, `roles.ts`, `rows.ts`, `settings.ts`,
   `seedCatalog.ts`, `todayModel.ts`, `dishesModel.ts`, `cookModel.ts`, `dishModel.ts`,
   `prepModel.ts`, `onboardingModel.ts`). `client.ts` and `seed.ts` are the two exceptions,
   and both exist to *set the database up* rather than to shape a row.
   `src/notifications/` is the same idea for the OS: `client.ts` is the only module that
   imports `expo-notifications`, and everything it says or schedules is decided in
   `prepModel.ts` first.
   Row-shaping and window logic go in the pure modules, so
   they can be unit tested in Node. Never read the clock in either — take `now` as an
   argument. One screen model per screen; shared row shapes and TEXT→union narrowing live
   in `rows.ts` so two models can't disagree about what a bad value means.
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

**The repertoire is what the user adds. `assets/seed_dishes.json` is a suggestion list
offered once in onboarding, with nothing pre-ticked** (`docs/SPEC.md` §18.1). Boot seeds
`role_config` and nothing else. Two versions of "helpfully fill the repertoire" have been
reverted — loading every seed dish on first run, and pre-ticking them all — so don't
reinstate either: suggestions and staleness are both claims about the user's *own* cooking,
and a default that most people accept is the outcome, not a suggestion. Dishes normally
arrive one at a time from the Dishes tab.

**Onboarding explains the app; it does not collect data** (§18.2, §18.3). It asks nothing
about cooking history — no last-cooked estimate, no frequency. Nothing writes
`cook_event.is_estimated` any more, though the column and its exclusion from the median stay
for imports.

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
  suggesting nothing. Because it is a hard exclusion, every field that can set it has to
  come with a way out: the Prep section on the dish detail screen is what makes it safe for
  the editor to ask (`docs/SPEC.md` §20.4, §19.2).
- **A prep row's state is never stored.** pending / live / expiring / expired are readings
  of two timestamps against the clock, made in `src/db/prepModel.ts` on every render.
  `prepPhaseAt` is the one definition — the Today banner, the dish's Prep section and the
  reminder planner all read it. Pruning an expired row is the app's one hard delete: prep is
  ephemeral state about a fridge, not history.
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

The first two rows are edited together on `app/dish/edit/[id].tsx`, because they change on
the same occasions and splitting them across two screens would be three taps to write down
one recipe. Sharing an editor does not make them one field: `notes` is what is true about the
dish every time, the recipe body is how you make it, and neither is a `tweakNote`.

That route also adds, edits and deletes the dish's **identity** — name, role, effort, slots
(`id=new` adds one). A dish needs a name and **at least one slot**: no slot fails a *silent*
eligibility filter, so the dish sits in the repertoire and is never once suggested. The
seven fields the form can't set — `prepKind`, `prepLeadHours`, `prepLabel`, `season`,
`usesLeftoverRice`, `isFestive`, `source` — are left out of the UPDATE rather than written
as null, so editing a seeded dish can't wipe them (`docs/SPEC.md` §19). Delete is soft and
cascades to slots and cook events, and its confirmation states the cook count — it's the one
action that destroys history, so it never does so quietly.

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

## Notifications

Local only, and only ever about **prep** (`docs/SPEC.md` §20). Two kinds: start the prep for
an overdue dish, and this prep is now ready. Never a daily "what's for dinner", never a
streak, never "you haven't logged in a while" — the app answers a question you came to it
with, and a notification makes it one that interrupts you.

- **Nothing nags.** A reminder is spaced by `PREP_NUDGE_COOLDOWN_DAYS`, because an overdue
  dish stays overdue and the naive version fires every night forever.
- **Permission is requested from a tap, never from a launch.** The scheduler only schedules
  against a grant it already has. A denied permission costs the reminder, never the feature.
- **Timing is planned, not read.** `SLOT_COOK_HOUR` is when a meal gets *cooked* and is a
  different table from the §2.2 detection boundaries. A fire time inside quiet hours moves
  **earlier**, never later.
- Scheduling is a **set difference on identifiers**, which encode what fires and when. Never
  cancel-all-and-reschedule: it drops a reminder that was about to fire.

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
- **No `Alert.alert`, no platform-drawn UI.** It ignores the theme entirely and follows the
  *system* scheme, so it can arrive in light mode on a dark device. Use
  `src/components/ConfirmDialog.tsx`; backdrop and hardware back always cancel, never
  confirm (`docs/SPEC.md` §14.4).
- The mockup is light-only and stays authoritative for light. Dark is designed, so a new
  colour needs a contrast check in both schemes: 4.5:1 for body text, 3:1 for graphics.
  Three *existing* light values miss those floors and are knowingly left alone —
  `docs/SPEC.md` §14.3.1. Don't "fix" them in passing, and don't add a fourth.

- Ratings are 3-point: not again / fine / make again. Never 5 stars.
- The interval gauge fills toward the median; the hairline marks "due"; overdue overflows
  in red; unknown median renders as a hollow dashed bar.
- Empty states are inviting, never nagging. A dish with no recipe is a normal dish, not
  an incomplete one. No completion meters on data entry.
- The recipe is two free-text fields. Ingredients render as one bullet per line and the
  method as paragraphs split on blank lines — free text in, something that reads like a
  recipe out. That split is a *rendering* decision, so it lives in `src/db/dishModel.ts`
  as pure tested functions, not inside the component. No structured ingredient model.

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
