# Loop — backup & restore runbook

Single-page operator runbook for recovering Loop's Postgres database. Written for a future operator under stress: every step is copy-pasteable and concrete.

If you are reading this **during** an incident, jump straight to the relevant **Scenario** below. The rest is reference.

---

## Backup posture (reference)

| Property | Value |
|---|---|
| Provider | Neon Postgres |
| Project name | `loop` |
| Project ID | `ancient-mode-37618639` |
| Org | `nineteen87` |
| Region | `aws-us-east-1` |
| Postgres version | 17 |
| Primary branch | `main` (id `br-curly-resonance-aqqdif0v`) |
| Point-in-time history (PITR) retention | **24 hours** (free-tier default — `history_retention_seconds: 86400`) |
| Branch snapshots | Created on-demand; persist until deleted |
| Neon console | https://console.neon.tech/app/projects/ancient-mode-37618639 |

**What's covered:** every table in the primary database — `projects`, `channels`, `routes`, `events`, `todos`, `reminders`, and their indexes.

**What's NOT covered (and where each lives):**
- Vercel project + env vars (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `LOOP_ADMIN_USER`, `LOOP_ADMIN_PASSWORD`, `SESSION_SECRET`, `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, `LOOP_READ_KEY`, `CRON_SECRET`) → Vercel team `nineteen87` / project `loop`.
- Slack app config (bot token, signing secret, interactivity URL, GitHub webhook URL) → Slack app "Elio" in the same workspace as the bot.
- GitHub webhook secrets per consumer repo (for issue-resolve-on-close) → each consumer repo's webhook settings.

---

## RTO / RPO

| Target | Current capability |
|---|---|
| **RPO** (max data loss) | Up to 24h — equal to the PITR window |
| **RTO** (time to restore) | **~10 seconds** branch-create + verify; **+1–3 min** to repoint Vercel + redeploy |

**Gap to flag:** the 24h PITR window is the free-tier ceiling. If retaining the ability to roll back further matters (post-mortems, slow-burn data corruption that wasn't noticed for days), upgrade the Neon plan to extend retention. Branch snapshots can be created manually at any time and persist indefinitely until deleted — see "Manual snapshots" below.

---

## Scenarios

### (a) Accidental data loss / bad migration — restore to a point in time

Use when: a `pnpm db:push` wrote bad data, a bug deleted rows, an admin action was reverted, etc. The damage happened **within the last 24 hours**.

1. **Stop the bleed.** If the bug is still actively producing bad data, pause writes:
   - For app-level bugs: revert the offending Vercel deploy (Vercel → loop → Deployments → previous → Promote to production).
   - For SQL-level bugs: in Neon console, **Settings → Connection pooling**, temporarily disable pooled connections to halt the app. (Severe — use only if you can't revert the deploy fast enough.)
2. **Identify the recovery point.** Pick the latest timestamp BEFORE the bad change.
3. **Create a recovery branch** in Neon console:
   - Branches → **Create branch**
   - Name: `recover-YYYY-MM-DD-HHmm` (use UTC)
   - Branch from: `main`
   - **Include data up to a specific date and time** → enter the recovery point in UTC
   - Click Create
4. **Verify the recovery branch has the right data**, replacing `<branch-id>` with the new branch's id:
   ```sql
   SELECT
     (SELECT count(*) FROM events) AS events,
     (SELECT count(*) FROM projects) AS projects,
     (SELECT max(created_at) FROM events) AS most_recent_event;
   ```
   Run via Neon console SQL Editor (branch selector at top) or `psql "$RECOVER_DATABASE_URL"`.
5. **Promote the recovery branch.** Two options:
   - **Cherry-pick** (preferred for partial loss): connect to both branches and copy only the affected rows back into main.
   - **Full repoint** (full corruption): see Scenario (b) — point Vercel at the recovery branch and rename it to `main`.
6. **Tell the consumers** if any event was lost from the window so they can re-queue (mattdecrevel.com, profiles).

---

### (b) Database corruption / Neon outage — restore to a fresh branch and repoint Vercel

Use when: the primary branch is unreachable or returning corrupt data, but the Neon project itself is healthy and recent branches/PITR are intact.

1. **Create a fresh branch** from `main` at a known-good time (most recent if available, otherwise pick a PITR point as in scenario (a) step 3).
2. **Copy the branch's connection strings** from Neon console → Branches → click the branch → Connection details. You need both pooled and unpooled. Treat them as the new `DATABASE_URL` / `DATABASE_URL_UNPOOLED`.
3. **Update Vercel env vars** (production scope only at first):
   ```bash
   # From a dev machine with the Vercel CLI logged in to team nineteen87:
   vercel env rm DATABASE_URL production --yes
   vercel env rm DATABASE_URL_UNPOOLED production --yes
   vercel env add DATABASE_URL production       # paste pooled URL
   vercel env add DATABASE_URL_UNPOOLED production  # paste unpooled URL
   ```
4. **Redeploy production** — in Vercel console: loop → Deployments → latest → ⋯ → Redeploy (do NOT use the cached build; let it re-evaluate env).
5. **Verify** within 60 seconds of the redeploy completing:
   ```bash
   curl -s https://loop.decrevel.dev/api/health
   # Expect: {"ok":true,"service":"loop"}
   ```
   Then send a test event via the operator console (`/previews` → pick any → Send live) and confirm it shows up in Slack and in `/events`.
6. **Once stable, rename the new branch to `main`** in Neon console (delete the bad one if you're certain, or keep it as `quarantine-YYYY-MM-DD` for forensics).
7. **Update preview env** to point at the same new branch (or a fresh fork of it) — Vercel → Settings → Environment Variables → Preview scope.

---

### (c) Complete project loss — restore from latest branch into a brand-new Neon project

Worst-case: the Neon org or project is lost (account compromise, Neon-side data loss, etc.). This assumes you have a branch dump or a recent SQL backup outside Neon. **There is no automated path for this today — see "Gap" below.**

1. **Create a new Neon project** (same region: `aws-us-east-1`).
2. **Import the schema** from the loop repo's Drizzle migrations:
   ```bash
   cd ~/Development/loop
   DATABASE_URL_UNPOOLED="<new-project-unpooled-url>" pnpm db:migrate
   ```
3. **Import the data** from the most recent SQL dump (see "Gap" — there isn't one in regular rotation today). If only the old project's branch is reachable, use `pg_dump` against the old PITR-recovered branch and `pg_restore` into the new project's `main`.
4. **Update Vercel env vars** as in scenario (b) step 3.
5. **Update the Neon project ID + connection strings** in this runbook and `CLAUDE.md` (if applicable).
6. **Verify** as in scenario (b) step 5.
7. **Manually re-mint any project API keys** the operator console can't recover from data alone (none today — keys are stored hashed but the secrets are in the consumer repos' Vercel env, so as long as those are intact the existing keys keep working).

---

## Manual snapshots (recommended before high-risk changes)

Before a schema migration, a large data backfill, or any operation that crosses the "I could lose this" threshold:

```bash
# From the Neon console, just click Branches → Create branch → name it "pre-<change>-YYYY-MM-DD"
# Branch from current `main`. Don't pick a time — get the live state.
```

The branch persists indefinitely. Rolling back is then "restore from snapshot": follow scenario (b) using the snapshot branch as the source.

Naming convention: `pre-<short-description>-YYYY-MM-DD` (e.g., `pre-todos-migration-2026-05-29`).

Clean snapshots up monthly — they consume storage quota.

---

## Verification SQL

Drop-in query to verify a branch matches expected state. Run against any branch via Neon console SQL Editor (branch selector at top).

```sql
-- Drop-in integrity check. Compare against the same query on production main.
SELECT
  (SELECT count(*) FROM events) AS events,
  (SELECT count(*) FROM projects) AS projects,
  (SELECT count(*) FROM channels) AS channels,
  (SELECT count(*) FROM routes) AS routes,
  (SELECT count(*) FROM todos) AS todos,
  (SELECT count(*) FROM reminders) AS reminders,
  (SELECT max(created_at) FROM events) AS most_recent_event,
  current_timestamp AS query_run_at;
```

---

## Gaps to address

- **No off-Neon backup.** Scenario (c) above assumes a SQL dump exists somewhere outside Neon. Today, nothing dumps the DB on a schedule. If Neon itself fails, recovery is bounded by what's in the Neon project's branches. **Mitigation:** add a daily GitHub Actions workflow that runs `pg_dump`, encrypts with `age`, and pushes to a private GH artifact or S3 bucket. ~30 lines of YAML. Tracked but not built.
- **24h PITR ceiling.** Free-tier limit. Upgrading to a paid Neon plan extends this; worth doing once Loop hosts data we care about retaining longer (Slack message archive, audit logs).
- **No automated restore-drill cadence.** This runbook is verified manually (see drill log below). Quarterly re-verification would catch regressions in Neon's API + the runbook's accuracy.

---

## Drill log

### 2026-05-28 — initial drill (Claude Opus 4.7 / Matt)

**Goal:** verify the runbook's branch-creation path works against the real `loop` project and produces a branch with identical row counts and the same most-recent event timestamp as production.

**Procedure:**
1. Queried production `main` baseline counts (events, projects, channels, routes, todos, reminders, max(events.created_at)).
2. Created branch `dr-drill-2026-05-28` (id `br-orange-thunder-aq4ea7qj`) from `main`.
3. Ran the same baseline query against the drill branch.
4. Compared row counts and most-recent-event timestamps.
5. Deleted the drill branch.

**Timing (UTC):**
| Step | Wall clock | Δ |
|---|---|---|
| Branch-create requested | `2026-05-28T18:10:54.3Z` | — |
| Branch ready + first SQL submitted | `2026-05-28T18:11:00.3Z` | **+6.0s** |
| First SQL result returned | `2026-05-28T18:11:03.5Z` | **+9.2s total** |

**Verification:**

| Metric | Production main | Drill branch | Match |
|---|---|---|---|
| `events` count | 22 | 22 | ✅ |
| `projects` count | 2 | 2 | ✅ |
| `channels` count | 7 | 7 | ✅ |
| `routes` count | 7 | 7 | ✅ |
| `todos` count | 0 | 0 | ✅ |
| `reminders` count | 0 | 0 | ✅ |
| Most recent event | `2026-05-28T13:32:50.500Z` | `2026-05-28T13:32:50.500Z` | ✅ |

**Result:** restore path works. Branch-create-to-queryable is **~10 seconds** end-to-end on a 22-row dataset. RTO holds.

**Next drill due:** 2026-08-28 (quarterly).
