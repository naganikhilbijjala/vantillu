# Vantillu — product spec

Authoritative source for **product decisions**: vocabulary, filters, weights, windows, and
thresholds. Read this together with:

- `CLAUDE.md` — conventions and hard rules (root, loaded every session)
- `docs/IMPLEMENTATION.md` — the phased build plan
- `docs/vantillu-mockup.html` — the intended look, and a runnable reference implementation
  of the scoring engine

Where this file and the mockup disagree, **this file wins** — the mockup is a sketch with
hard-coded context. Where this file and `CLAUDE.md` disagree, fix one of them in the same
commit; they must never diverge.

Every numeric constant below belongs in `src/core/` as a named export, never inline.

---

## 1. Vocabulary

### 1.1 Roles

Eleven seeded roles. `dish.role` is unconstrained TEXT — **no CHECK constraint** — because
roles are user-editable later.

| Role | Label | Always available |
|---|---|---|
| `staple` | Staple | no |
| `tiffin` | Tiffin | no |
| `dal` | Dal | no |
| `dry_curry` | Dry curry | no |
| `gravy` | Gravy | no |
| `one_pot` | One-pot | no |
| `pachadi` | Pachadi | no |
| `podi` | Podi | **yes** |
| `accompaniment` | Accompaniment | **yes** |
| `snack` | Snack | no |
| `sweet` | Sweet | no |

This matches `assets/seed_dishes.json`. Two earlier drafts disagreed: `CLAUDE.md` listed a
`rice` role and no `staple`, and the mockup uses `rice`/`dry` as shorthand. Both are
superseded. `staple` (plain rice, chapati, puri) and `one_pot` (pulihora, biryani, curd
rice) are **distinct** and both are needed — see §4.3.

**Always-available roles are configuration, not code.** `podi` and `accompaniment` are
never suggested, never stale, and excluded from scoring entirely, but the engine must not
test for those two strings. A `role_config` row carries the flag, and `Candidate` carries
`isAlwaysAvailable: boolean` resolved by the query layer. Renaming a role in the UI must
not silently kill the behaviour.

### 1.2 Effort — ordinal

Effort is a closed union with a **fixed rank**. Scoring compares ranks; it must never
depend on the ordering of a budget array.

| Effort | Rank |
|---|---|
| `instant` | 0 |
| `quick` | 1 |
| `medium` | 2 |
| `project` | 3 |

`dish.minutes` is display-only. It never enters a filter or the score.

### 1.3 Slots

`breakfast` · `lunch` · `dinner` · `snack`. Many-to-many via `dish_slot` — **tiffin is
valid for breakfast and dinner**, which is the whole reason the table exists.

### 1.4 Prep kinds

`batter` · `soaked` · `marinated`. See §5.

---

## 2. Time

### 2.1 Storage

`cook_event.cooked_at` stores a **full local ISO 8601 datetime** (`2026-07-26T08:14:00`),
not a date. The slot already implies a time of day, and date-only strings produce
off-by-one errors once interval math crosses a timezone or a midnight boundary.

All interval math **truncates to the local calendar day first**, then subtracts. Never
subtract raw timestamps and divide — a 23-hour gap and a 25-hour gap are both "1 day".

No UTC anywhere. This app has one user in one timezone; storing local time keeps
"what did I cook this morning" honest across a DST change or a flight.

### 2.2 Slot auto-detection

Today's slot is derived from the local hour, with a manual override that persists until
the next slot boundary.

| Local time | Slot |
|---|---|
| 04:00 – 10:59 | `breakfast` |
| 11:00 – 16:59 | `lunch` |
| 17:00 – 03:59 | `dinner` |

`snack` is **never auto-detected** — it's reachable by manual override and by the log
sheet, but Today never opens on it.

The override is held **in memory only** (Phase 4). It lapses at the instant
`nextSlotBoundary` returns and is not persisted, so there is no `setting` row for it and
nothing for the Phase 10 export to carry. Reopening the app hours later re-reads the clock,
which is what anyone reopening it would expect. Because the expiry is an instant rather than
"the slot it was taken in", an override taken at 21:00 correctly survives midnight and ends
at 04:00 along with dinner itself.

While an override is in force the Today header states **both** times: the eyebrow says the
real time of day, the title says the slot being answered for. Showing only the override
reads as the app having lost track of the clock.

### 2.3 Seasons

Derived from the local month. Indian seasons, not the Western four — the seed only uses
`summer` and `monsoon`.

| Season | Months |
|---|---|
| `summer` | March – June |
| `monsoon` | July – September |
| `winter` | October – February |

`dish.season` is nullable; null means "any season" and never matches or penalises.

---

## 3. Interval math — `src/core/interval.ts`

- Intervals are day-gaps between consecutive cook events, newest first.
- `medianInterval` uses **the most recent 5 intervals**.
- Fewer than 2 intervals (i.e. fewer than 3 cook events) → `null`. The UI renders "new
  dish", never an invented number.
- **Median, not mean.** One six-week travel gap must not convince the app you make
  tamarind rice twice a year.
- Even count → mean of the two middle values, rounded.
- `staleness(daysSince, median) = median ? daysSince / median : 1`. Unknown median scores
  neutral.

**A median of 0 is treated as unknown.** Two cooks on the same day can produce it. The
`median ? … : 1` guard already routes it to the neutral branch; this is intended, not
incidental, and needs its own test so it can't be "fixed" later by accident.

`isEstimated` cook events (written during onboarding) count toward `daysSince` and
`cookCount` but are **excluded from interval math** — a bucketed guess like "about a month
ago" would poison the median.

---

## 4. Suggestion engine — `src/core/scoring.ts`

Hard filters first, then a weighted score over the survivors. `score()` is deterministic;
jitter lives in the caller (§4.5).

### 4.1 Filters — `isEligible`

Evaluated in this order. First failure wins, and the reason is retained for the "held
back" section.

| # | Filter | Held back? |
|---|---|---|
| 1 | `isArchived` | no — invisible by design |
| 2 | `isAlwaysAvailable` role | no — never a suggestion |
| 3 | slot not in `dish.slots` | no — noise |
| 4 | effort rank > slot budget | **yes** |
| 5 | `prepKind` set with no live prep | **yes** |
| 6 | `!isVeg` on a veg-only day | **yes** |

Filters 1–3 are silent because surfacing them would list most of the repertoire. 4–6 are
surfaced because the user *expects* those dishes and a silent omission reads as a bug.

### 4.2 Slot budgets

The maximum effort rank allowed per slot. Weekend = Saturday or Sunday.

| Slot | Weekday | Weekend |
|---|---|---|
| `breakfast` | `medium` (2) | `project` (3) |
| `lunch` | `project` (3) | `project` (3) |
| `dinner` | `project` (3) | `project` (3) |
| `snack` | `medium` (2) | `medium` (2) |

Weekend breakfast opens up so a Sunday bobbatlu or a leisurely gutti vankaya isn't
filtered out on the one morning there's time for it.

### 4.3 Score weights

Base is the staleness ratio. Then:

| Δ | Condition |
|---|---|
| **+1.5** | effort rank ≤ 1 (`instant` or `quick`) |
| **+1.2** | `usesLeftoverRice` and a rice staple was cooked in the last 24 h |
| **+1.0** | `prepKind` set and its live prep expires within 24 h |
| **+0.8** | `dish.season` equals the current season |
| **−4.0** | `primaryIngredient` cooked in the last 2 days |
| **−2.0** | this role was filled by a batch cook in the last 48 h |
| **−1.5** | most recent rating was 1 (*not again*) |

Definitions that were previously unstated:

- **Rice staple** — a cook event on a dish with `role = 'staple'` **and**
  `primaryIngredient = 'rice'`. This is why `staple` and `one_pot` must stay separate: the
  boost fires from plain rice, and lands on pulihora and curd rice.
- **Recent ingredient** — any `primaryIngredient` cooked within 2 calendar days,
  including today. Null `primaryIngredient` never matches.
- **Batch cook** — a cook event with `isBatch = true` within 48 h. It fills that dish's
  role for the window, so the app stops pushing a second dal when there's a pot of it in
  the fridge.
- **Expiring prep** — a live `prep_state` row whose `expiresAt` is within 24 h. This is a
  *bonus*, not a filter: use the batter before it dies.
- **Last rating** — the rating on the most recent cook event **that carries one**, not the
  rating on the most recent cook event. A cook logged in a hurry with no rating is not an
  opinion and must not erase an earlier *not again*. Resolved in Phase 4; the phrase in the
  table above is "last rated 1", and this is what that means.

The three windows above are elapsed hours; the recent-ingredient window is **calendar
days**, per §2.1. A rice staple at 23:00 is still leftover rice at 09:00, and a batch cook
is a 48-hour fridge fact, but "cooked brinjal yesterday" is a day boundary — a 23-hour gap
and a 25-hour gap are both yesterday.

The −4.0 ingredient penalty is deliberately large enough to sink an overdue dish. Repeating
brinjal three days running is worse than eating something less due.

### 4.4 Score must not depend on array order

Implement the effort-fit bonus as `effortRank(dish.effort) <= 1`, against the fixed table
in §1.2.

Do **not** use `ctx.budget.indexOf(dish.effort) < 2` (as the mockup and the first draft of
`IMPLEMENTATION.md` do). That works only while budget arrays happen to be sorted ascending,
and `indexOf` returns `-1` for an effort outside the budget — which is also `< 2`, so an
ineligible dish would collect the bonus if `score()` were ever called without
`isEligible()` first. A test must cover exactly that call order.

### 4.5 Ordering and jitter

`score()` is pure and deterministic (hard rule 4). The caller sorts:

1. score descending
2. `daysSince` descending
3. `dish.createdAt` ascending
4. `dish.id` ascending

The third key used to be `dish.id` alone. Ids are UUIDs (§11.2), so they no longer carry
insertion order — `createdAt` restores a meaningful tiebreak, with `id` as the final
deterministic backstop.

Jitter is applied by the caller as ±0.15, seeded from `(dishId, localDateKey)` — so the
list is **stable within a day** and only reshuffles tomorrow. Re-rendering the Today
screen, or backgrounding and reopening the app, must never reorder the suggestions.

### 4.6 What the UI shows

- **Three suggestions**, with a "show three more" affordance.
- **Every suggestion displays its dominant reason as a chip.** A suggestion without a
  stated reason gets ignored. Maximum three chips, in this precedence: staleness state →
  prep ready → leftover rice → quick.
- Staleness chip wording: `new dish` (null median) · `N days ago` (ratio < 1) ·
  `due, N days` (1 ≤ ratio < 1.6) · `N days — long overdue` (ratio ≥ 1.6).
- **Held back** section, prose not a list, covering filters 4–6 only. Cap at three
  clauses; if more were held back, the section says so in aggregate rather than growing.
  One clause per surfaced reason, and **within a clause, two dish names then a count** —
  "Rajma, Chana masala and 3 others". A slot that holds back fifteen dishes still costs
  three sentences. The clause wording lives with the Today screen, not in `src/core/`:
  SPEC fixes the chip labels because the engine emits them, and leaves this copy to the
  screen that renders it.
- Empty is a normal state, not a failure. A slot with nothing eligible says so and offers
  the next move; it never scolds, and the held-back prose underneath does the explaining.

---

## 5. Prep-ahead model

### 5.1 Schema amendment

`IMPLEMENTATION.md` §4 needs two columns it doesn't have. Both land in **Phase 1**, so no
later migration is needed:

- `dish.prep_kind` — TEXT, nullable. One of §1.4.
- `prep_state.ingredient` — TEXT, nullable.

Phase 1 also changes every table's primary key to a UUID and adds `updated_at` /
`deleted_at` throughout — see §11.2 and §11.3.

Without these, `isEligible`'s `ctx.livePrep.includes(d.id)` has no way to be computed:
`prep_state` as drafted has no link to any dish, and `kind` alone conflates soaked moong
for pesarattu with soaked kidney beans for rajma.

### 5.2 Matching

A dish has live prep when a `prep_state` row satisfies **all** of:

```
prep_state.kind       = dish.prep_kind
prep_state.ingredient = dish.primary_ingredient
prep_state.ready_at  <= now
prep_state.expires_at > now
```

Matching on the pair is what makes one batter row cover idli, dosa, uttapam and punugulu
(all `batter` + `urad dal`) while correctly leaving out pesarattu (`soaked` + `moong dal`).

A dish with `prepKind` set and no matching live row is **hard-excluded**. Suggesting dosa
with no batter is worse than suggesting nothing.

Both timestamps are nullable, and Phase 4 fixed what a null means: **no `readyAt` is
ready** (there was no lead time to wait out) and **no `expiresAt` never expires**. Either
reading leaves the user in control rather than quietly binning their batter. An archived
dish is never counted as unlocked, and a live row that unlocks nothing raises no banner —
"Batter is ready" over an empty list is worse than silence.

### 5.3 Lifecycle

`readyAt = createdAt + prepLeadHours`. Default shelf life by kind, editable per row:

| Kind | Shelf life from `readyAt` |
|---|---|
| `batter` | 72 h |
| `soaked` | 24 h |
| `marinated` | 24 h |

States: **pending** (`now < readyAt`) → **live** → **expiring soon** (within 24 h of
`expiresAt`) → **expired** (hidden from the banner, rows retained). Expired rows are
pruned on app start once older than 30 days.

### 5.4 Seed mapping

`assets/seed_dishes.json` predates this model and uses a `prep` enum. The loader maps:

| Seed `prep` | `prepKind` | `prepLeadHours` | `prepLabel` |
|---|---|---|---|
| `none` | null | null | null |
| `soak_overnight` | `soaked` | 8 | `soak overnight` |
| `ferment` | `batter` | 12 | `grind and ferment` |

The loader also maps snake_case → camelCase and `0|1` → boolean, and remaps the seed's
`local_name` to `dish.altName`. Write it as an explicit typed mapper with a per-field
assignment, not a spread — the shapes genuinely differ.

---

## 6. Veg-only days

Two settings, both consulted by the query layer, never by `src/core/`:

- `vegOnlyWeekdays` — JSON array of ISO weekday numbers (1 = Monday). **Default `[]`.**
- `vegOnlyToday` — an ISO date string or null. A one-day manual override.

Default is empty on purpose: silently hiding chicken curry on a fresh install would read
as a bug, not a feature. The Today screen exposes the override as a toggle; the weekday set
is configured in settings.

The toggle only ever moves `vegOnlyToday`. When it is the *weekday set* making today
vegetarian, the toggle reads as **on but locked** rather than as switchable — tapping it
could not turn the day off, and a control that visibly fails to do what it says is worse
than one that explains itself. Turning the override off writes an empty string rather than
deleting the row, so the row keeps its `updatedAt` for the export.

A malformed `vegOnlyWeekdays` value parses to the empty default rather than throwing. A
corrupt settings row must not be able to stop the Today screen from rendering.

---

## 7. Ratings and notes

Ratings are **3-point**, stored as integers. Never 5 stars.

| Value | Label |
|---|---|
| 1 | not again |
| 2 | fine |
| 3 | make again |

Only `rating = 1` affects the score (−1.5). A 3 is *not* a bonus — the staleness ratio
already governs rotation, and boosting favourites would collapse the repertoire onto four
dishes.

The three kinds of note stay separate; see the table in `CLAUDE.md`. `tweakNote` is
per-cook-event and the chronological sequence of tweaks is what becomes the real recipe.
Never fold them into the dish record.

---

## 8. Gauge geometry

From `docs/vantillu-mockup.html`. These four numbers are tokens, not magic numbers in a
component.

- Fill fraction = `min(ratio, 1.4) / 1.4`. Ratios above 1.4 clamp.
- The "due" hairline sits at `1 / 1.4` = **71.4 %**.
- Fill colour: **turmeric** when ratio < 1, **gongura red** when ratio ≥ 1.
- Null median → hollow bar, 1 px dashed border, no fill. Never a zero-width solid bar —
  "no data" and "just cooked" must not look alike.

Bar height 3 px; 56 px wide in the dishes list, full-width on a card.

---

## 9. Decision log

Eight open questions were resolved by applying the recommended default. Each is a
**one-line change here plus its constant in `src/core/`** — flip any of them before Phase 2
and nothing else needs touching.

| # | Decision | Status | §|
|---|---|---|---|
| 1 | 11 roles from the seed, keeping both `staple` and `one_pot` | default applied | §1.1 |
| 2 | Rice staple = `role='staple'` ∧ `primaryIngredient='rice'`, 24 h | default applied | §4.3 |
| 3 | Veg-only = weekday set + today override, both empty by default | default applied | §6 |
| 4 | Weekend breakfast allows `project`; weekdays cap at `medium` | default applied | §4.2 |
| 5 | Batch cook fills its role for 48 h | default applied | §4.3 |
| 6 | Indian seasons derived from month | default applied | §2.3 |
| 7 | `snack` is a real slot, but never auto-detected | default applied | §2.2 |
| 8 | No in-app dictation — rely on the OS keyboard mic | default applied | §12 |
| 9 | UUID text primary keys on every table | agreed | §11.2 |
| 10 | `updatedAt` + `deletedAt` on every table | agreed | §11.3 |
| 11 | Export is a versioned envelope, not a bare array | agreed | §10.3 |
| 12 | Photos live outside the backup set and outside the export | agreed | §10.4 |
| 13 | Dark mode ships, following the OS scheme with no in-app setting | **reversed in Phase 3** | §14 |

---

## 10. Backup and data portability

The app has no backend and never will (`CLAUDE.md` hard rule 5). That makes getting data
off the device a **product feature**, not an ops concern.

### 10.1 OS backup is a safety net, not a guarantee

`expo-sqlite` writes into the app's private data directory, which both platforms include
in their automatic backups: Android Auto Backup (`allowBackup` stays **true**) and iOS
iCloud Backup. Leave both enabled — they cost nothing and will rescue the common case.

Never present them to the user as a promise. They fail in ways the app cannot detect:

- Android caps Auto Backup at **25 MB per app**. Past that it silently stops.
- Restore realistically fires only during new-device setup or a Play reinstall.
- Auto Backup runs roughly daily on wifi/charging — up to a day of loss.
- iCloud Backup needs iCloud space; the 5 GB free tier is usually full.
- **Android → iOS or iOS → Android carries nothing.** The formats are incompatible.
- Neither can be verified from inside the app.

### 10.2 WAL checkpoint

`expo-sqlite` journals in WAL mode, so recent writes live in a `-wal` sidecar. A
file-level backup that catches the pair mid-write can restore inconsistently. Checkpoint
(`PRAGMA wal_checkpoint(TRUNCATE)`) **before every export** and on app background, so the
`.db` file alone is always a complete picture.

### 10.3 Export is the real migration path

Phase 10's JSON export is the only mechanism that survives a cross-platform move, a
sideloaded build, and a stolen phone. It must be:

**A versioned envelope**, never a bare array:

```jsonc
{ "schemaVersion": 1, "appVersion": "1.0.0", "exportedAt": "2026-07-26T09:12:00", "data": { … } }
```

Every export file is a permanent artifact sitting in someone's Drive. Without
`schemaVersion`, a file exported today becomes unreadable guesswork the first time the
schema moves — and "lossless round-trip" quietly stops being true.

**Import is replace-all**, behind a blunt confirmation. Merge semantics need dedup rules
and conflict resolution; that work belongs with sync (§11), not before it.

**Discoverable.** Buried in a settings screen, nobody exports until after they've lost the
data. One tap from settings to the OS share sheet, filename dated.

Optionally, once the user picks a folder via Android's Storage Access Framework, write a
dated snapshot weekly. Still zero infrastructure, but a recoverable file exists without
the user remembering anything.

### 10.4 Photos are excluded

`cook_event.photo_uri` stores a **reference into the device gallery**. Photos are not
copied into app storage and are not embedded in the export.

Two reasons, both concrete. Copying photos into app storage blows past Android's 25 MB cap
within a few dozen cooks — which disables backup **for the whole app**, taking the
irreplaceable cook history down with the nice-to-have images. And embedding base64 images
would bloat the export far beyond what a share sheet handles comfortably.

The consequence is honest and must be stated in the export UI: **text round-trips
losslessly; photo references will dangle after a device move.** A cook photo is a
nice-to-have. The history is not.

---

## 11. Future-proofing for multi-device

**Multi-user, sync, accounts, and paid tiers are explicitly NOT in scope** and remain on
the Not-in-v1 list (§12). This section exists only so that a year of accumulated cook
history doesn't become the obstacle if that changes.

Three decisions cost nothing today and are expensive to retrofit. Everything else can
safely wait.

### 11.1 What is safely deferred

Play Billing and one-time purchase entitlements, feature gating, account screens, a
`userId` column, per-user settings, and the sync server itself. All of it is additive
later. Notably `src/core/` is untouched by any of it — the scoring engine has no idea a
database exists, which is precisely why hard rule 1 is worth keeping.

Sync is also two separate features that get conflated. **Sync** (one user, two devices) is
what a premium tier would actually sell. **Household sharing** (two people, one repertoire)
is a different product question — whose median interval governs a shared dish? — and is
not addressed here.

### 11.2 UUID primary keys

Every table uses `text('id').primaryKey()` with a v4 UUID from `expo-crypto`, not
`integer().primaryKey({ autoIncrement: true })`.

With autoincrement, two devices both mint `dish.id = 7` for different dishes, and merging
means renumbering rows and rewriting every foreign key in `dish_slot` and `cook_event` —
plus every export file already in the wild still carries the old numbering. UUIDs make
rows from any device globally unique, so a merge is a union.

At this scale the storage and speed difference is not measurable. The one real cost is
that ids no longer imply insertion order, which is why §4.5 sorts on `createdAt` first.

### 11.3 `updatedAt` and soft deletes

Every table carries `updated_at` (TEXT, local ISO, set on every write) and `deleted_at`
(TEXT, nullable). Deletes are soft; queries filter `deleted_at IS NULL`.

Retrofitting these is lossy in a way the other changes aren't. Added later, every existing
row gets a fabricated `updatedAt`, and **every deletion made before the change is
unrecoverable** — a dish deleted on the old phone silently returns from the new one's copy.

This does not conflict with hard rule 2. `updatedAt` is *recorded*, not derived, so it
cannot drift the way a cached `cookCount` would.

Soft deletes also need honouring in the export: tombstones ship with the data, so a
replace-all import doesn't resurrect them.

### 11.4 Deliberately not changed

**Local time stays local** (§2.1). It looks like a multi-device liability but isn't — this
app is about the user's local day, so "what did I cook this morning" must stay anchored to
where they were. Multi-timezone sync would add a `tz` column alongside; it would not
switch the app to UTC. Pre-emptively storing UTC would make the single-user case worse
today in exchange for nothing.

**Building sync remains real work** whenever it happens: conflict resolution, a server,
auth, a privacy policy, running costs. Nothing above makes that cheap. It only ensures the
accumulated data is mergeable when the time comes.

---

## 12. Not in v1

Each of these was considered and deliberately cut. Re-opening one is a product decision,
not a task.

- **In-app dictation.** The mockup shows a "hold to dictate" control. Expo has no
  speech-to-text (`expo-speech` is text-to-*speech*), so it would mean a native module.
  The OS keyboard's own mic button is free and already muscle memory — the tweak-note
  field just needs to be a normal multiline input.
- **Home-screen widgets.** Kotlin *and* WidgetKit — two native implementations. Revisit
  only once daily logging has stuck.
- **Structured recipe ingredients.** Free text for v1. A parser for "a small piece of
  jaggery" and "4 whistles" is weeks of work and buys nothing until shopping lists exist.
- **Backend, auth, sync, accounts, paid tiers.** Local SQLite plus versioned JSON export.
  See §11 for the three schema decisions that keep this door open at zero cost today.
- **An in-app light/dark setting.** Dark mode itself now ships — see §14 — but the scheme
  follows the OS and there is nothing to configure.
- **Meal planning ahead of today.** Vantillu answers "what should I cook *now*". A
  week-ahead planner is a different app.
- **Nutrition, calories, macros.** Not this app, ever.

---

## 13. Dependencies the build plan is missing

Noted here so Phase 6 and Phase 9 don't stall. `IMPLEMENTATION.md` §2 omits:

- **`expo-crypto` — needed in Phase 1, not later.** `randomUUID()` now generates every
  primary key (§11.2), as well as `cook_event.meal_id` for grouping dishes cooked
  together. This one cannot wait for the phase that uses it, because the schema depends
  on it.
- `expo-image-picker` — Phase 6, for `cook_event.photo_uri`. Configure it to keep a
  gallery reference rather than copying the file into app storage (§10.4).

Both are `npx expo install`.

---

## 14. Theming — light and dark

Dark mode was on the Not-in-v1 list and was **reversed during Phase 3**, while the theme
was three components and four screens wide. §12 keeps the half of that decision which
still stands: there is no in-app light/dark *setting*.

### 14.1 The scheme follows the OS

`useColorScheme()` is the only input. Nothing is persisted, so no `setting` row exists, the
Phase 10 export envelope is unaffected, and there is no settings control to build.

`app.json` sets `userInterfaceStyle: "automatic"` — without it iOS never reports `dark` —
and gives `expo-splash-screen` a `dark` variant so the launch screen does not flash white
on a dark device.

`useColorSchemeName()` in `src/theme/useTheme.tsx` is the single place that resolves the
scheme. If an in-app override is ever wanted, that function is the only one that changes.

### 14.2 Colour is named by role, never by appearance

`src/theme/tokens.ts` holds both palettes behind one `Palette` interface and is the **only
place a hex literal may appear**. A colour is chosen by what it is for — `steel1` is a
raised surface, `lineSoft` is a divider, `gongura` is past-due — and each scheme supplies
its own value for that role.

The three `steel` surfaces are ordered by prominence, not brightness: in light they run
light → lighter, and after dark they run dark → lighter. A component that picks a token
because of how bright it looks will invert wrongly in the other scheme.

`steelPressed` exists because "one step brighter than a card" is `steel2` in light and
`steel0` in dark, so no member of the ordered triple expresses it.

### 14.3 The dark palette is designed, not derived

`docs/vantillu-mockup.html` is light-only and stays authoritative for light. Dark follows
three rules:

- **Surfaces rise by getting lighter**, so a chip still separates from the card under it.
- **Each accent splits in two.** The graphic value (gauge fill, banner dot) is brightened,
  because the light values are too dark to register against a dark surface. The chip pair —
  a desaturated `Bg` and a high-lightness `Ink` — is separate, since reusing the graphic
  value as text on a tinted fill fails contrast.
- **Contrast floors**: 4.5:1 for body text, 3:1 for graphic elements and large type. The
  dark palette was measured against these and clears all of them.

Everything meaning-carrying is unchanged after dark. Turmeric is still "not due yet", red
is still past due, green is still "something is ready", and the gauge geometry in §8 does
not move.

### 14.3.1 Three inherited light-mode contrast failures

The floors above are the rule for **new** colours. The light palette predates them: it is
transcribed from the mockup, and measuring it turned up three values that miss, all on the
lightest surfaces (`steel1` / `steel2`).

| Pair | Measured | Floor | Where it shows |
|---|---|---|---|
| `ink3` #8C9794 on `steel1` | 2.83 | 4.5 | Every eyebrow and mono metadata line |
| `ink3` as the due hairline | 2.83 | 3.0 | The gauge's "due" mark |
| `turmeric` #BE8E17 fill | 2.78 | 3.0 | The gauge fill for a not-yet-due dish |

These are **not** dark-mode regressions — the same roles in dark measure 4.53, 4.53 and
7.35. They are left as-is because the mockup is authoritative for the light look and fixing
them changes it visibly: `ink3` would need roughly #697572, which darkens all tertiary text.

Fixing them is a one-line change per value in `tokens.ts` and a product decision, not a
task. Until then, the honest statement is that dark mode meets AA and light mode does not,
in three places, and nothing new may be added below the floors.

### 14.4 Two rules that are easy to break

`StyleSheet.create` must not run at module scope any more — it would capture one palette
for the life of the process. Styles come from `useThemedStyles(makeStyles)`, which builds
each scheme's sheet at most once and caches it, so style identity stays stable across
renders.

A hard-coded hex outside `tokens.ts` will look correct in whichever scheme it was written
for and wrong in the other. There is no third place for colour.
