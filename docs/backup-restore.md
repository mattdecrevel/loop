# Loop — backup & restore runbook

Single-page operator runbook for recovering Loop's Postgres database. Written for a future operator under stress: every step is copy-pasteable and concrete.

If you are reading this **during** an incident, jump straight to the relevant **Scenario** below. The rest is reference.

> **2026-07-01 — Loop moved off Neon → Supabase (Free).** The old runbook was built on Neon's PITR + instant branching. **Supabase Free has neither** (no automated backups, no point-in-time recovery — those are Pro-plan features). The recovery model is now **restore from the most recent `pg_dump`**. That makes the off-provider dump — previously a deferred "nice to have" behind Neon's 24h PITR — the **primary and only** backup. Keep dumps current.

---

## Backup posture (reference)

| Property | Value |
|---|---|
| Provider | Supabase Postgres |
| Project ref | `zvarkwkyzaxcozmvgygq` |
| Org | Supabase **Free** org (personal account) |
| Region | `aws-us-east-2` |
| Postgres version | 17 |
| Runtime connection | Transaction pooler `aws-1-us-east-2.pooler.supabase.com:6543` → `DATABASE_URL` (app uses `prepare:false`) |
| Migrations connection | Session pooler `aws-1-us-east-2.pooler.supabase.com:5432` → `DATABASE_URL_UNPOOLED` |
| Automated backups / PITR | **None** (Free tier). Recovery = last manual `pg_dump`. |
| Latest dump | `backups/loop-2026-07-01.sql` (captured at the Neon→Supabase cutover; verified hash-identical to Neon) |
| Supabase console | https://supabase.com/dashboard/project/zvarkwkyzaxcozmvgygq |

**What's covered by a dump:** every table in the primary database — `projects`, `channels`, `routes`, `events`, `todos`, `reminders`, plus enums and indexes (schema also lives in the repo's Drizzle migrations under `./drizzle`).

**What's NOT covered (and where each lives):**
- Vercel project + env vars (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `LOOP_ADMIN_USER`, `LOOP_ADMIN_PASSWORD`, `SESSION_SECRET`, `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, `LOOP_READ_KEY`, `CRON_SECRET`) → Vercel team `nineteen87` / project `loop`.
- Slack app config (bot token, signing secret, interactivity URL, GitHub webhook URL) → Slack app in the bot's workspace.
- GitHub webhook secrets per consumer repo (for issue-resolve-on-close) → each consumer repo's webhook settings.

---

## RTO / RPO

| Target | Current capability |
|---|---|
| **RPO** (max data loss) | **Age of the last `pg_dump`.** No PITR — anything written since the last dump is unrecoverable. Take a dump before risky changes and on a schedule (see Gaps). |
| **RTO** (time to restore) | **~5–15 min** — restore the dump into a Supabase project + repoint Vercel + redeploy. |

**Biggest gap:** with no PITR, RPO is only as good as dump cadence. Until the scheduled dump workflow exists (see Gaps), a manual `pg_dump` is the entire safety net. Loop's dataset is tiny (~250 rows, <1 MB) — dumping costs seconds.

---

## Taking a backup (`pg_dump`)

Run from any machine with a Postgres **17** client (`brew install postgresql@17`). Use the **session pooler** (`:5432`), not the transaction pooler (`:6543`).

```bash
cd ~/Development/loop
PGREF="zvarkwkyzaxcozmvgygq"
PGPASS="<supabase db password>"   # Supabase dashboard → Settings → Database
/opt/homebrew/opt/postgresql@17/bin/pg_dump \
  "postgresql://postgres.$PGREF:$PGPASS@aws-1-us-east-2.pooler.supabase.com:5432/postgres" \
  --no-owner --no-privileges --clean --if-exists \
  -f "backups/loop-$(date -u +%Y-%m-%d).sql"
```

Commit dumps out-of-band (they're gitignored) or push to durable storage. Verify a fresh dump is non-empty and contains all six `CREATE TABLE` / `COPY` blocks before trusting it.

---

## Scenarios

### (a) Accidental data loss / bad migration — restore from the last dump

Use when: a bad migration or bug corrupted/deleted data. **There is no PITR** — you roll back to the most recent `pg_dump`, losing anything written since.

1. **Stop the bleed.** If the bug is still writing bad data, revert the offending Vercel deploy (Vercel → loop → Deployments → previous → Promote to production). To fully halt writes, pause the Supabase project (dashboard → Settings → General → Pause) — severe; only if you can't revert fast enough.
2. **Locate the newest good dump** (`backups/loop-*.sql`, or wherever dumps are archived).
3. **Restore into a scratch project first** (never restore straight over prod until verified). Create a throwaway Supabase project, then:
   ```bash
   psql "postgresql://postgres.<scratch-ref>:<pw>@<scratch-pooler-host>:5432/postgres" -f backups/loop-<date>.sql
   ```
4. **Verify** with the integrity query below. If the dump has the rows you need, either cherry-pick the affected rows back into prod (partial loss) or repoint Vercel at the restored DB (full loss — Scenario (b)).
5. **Tell the consumers** (mattdecrevel.com, profiles) if events were lost so they can re-queue.

---

### (b) Corruption / outage / project loss — restore into a Supabase project and repoint Vercel

Use when: the primary DB is unreachable, corrupt, or the project is gone. Supabase Free has no branch/PITR fallback, so the dump is the recovery artifact.

1. **Provision a target project** — reuse the existing one if healthy, or create a fresh Supabase project (region `us-east-2` to match). Grab its **transaction pooler** (`:6543`) and **session pooler** (`:5432`) connection strings from dashboard → Settings → Database.
2. **Rebuild schema + data.** If restoring from a full `pg_dump` (schema+data):
   ```bash
   psql "<session-pooler-url>" -f backups/loop-<date>.sql
   ```
   If only the repo is available (no dump), rebuild schema from migrations, then reload whatever data you have:
   ```bash
   cd ~/Development/loop
   DATABASE_URL_UNPOOLED="<session-pooler-url>" pnpm db:migrate
   ```
3. **Update Vercel env vars** (production scope):
   ```bash
   # Dev machine with Vercel CLI logged in to team nineteen87:
   vercel env rm DATABASE_URL production --yes
   vercel env rm DATABASE_URL_UNPOOLED production --yes
   printf '%s' "<transaction-pooler :6543 url>" | vercel env add DATABASE_URL production
   printf '%s' "<session-pooler :5432 url>"     | vercel env add DATABASE_URL_UNPOOLED production
   ```
4. **Redeploy production** — `vercel --prod` (or Vercel console → loop → Deployments → latest → Redeploy, **uncached** so env re-evaluates).
5. **Verify** within 60s of the redeploy completing:
   ```bash
   curl -s https://loop.decrevel.dev/api/health   # expect {"ok":true,"service":"loop"}
   ```
   Then send a test event via the console (`/previews` → pick any → Send live) and confirm it lands in Slack and `/events`.
6. **Update this runbook** with the new project ref + connection details if the project changed.
7. **Re-mint project API keys** only if needed — keys are stored hashed; the secrets live in consumer repos' Vercel env, so existing keys keep working as long as those are intact.

---

## Manual snapshot before high-risk changes

Supabase Free has no instant branch. Before a schema migration or large backfill, **take a dump** (see "Taking a backup") named for the change:

```bash
pg_dump ... -f "backups/pre-<short-description>-$(date -u +%Y-%m-%d).sql"
```

Rolling back is then "restore from that dump" — Scenario (a)/(b). Prune old snapshots periodically.

---

## Verification SQL

Drop-in integrity check. Run against any DB via the Supabase SQL editor or `psql "<session-pooler-url>"`. Compare against the same query on production.

```sql
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

- **No scheduled off-site dump (now critical).** With Neon gone, there is no PITR and no automated backup. RPO = age of the last manual dump. **Mitigation:** add a daily GitHub Actions workflow that runs `pg_dump` against the session pooler, encrypts with `age`, and pushes to a private artifact / S3 bucket. ~30 lines of YAML. This was deferred under Neon; on Supabase Free it's the top backup priority.
- **No PITR.** Supabase Free omits point-in-time recovery. If sub-day RPO ever matters, either upgrade the Supabase org to Pro (adds daily backups + PITR) or move the project under the existing Pro org.
- **No automated restore-drill cadence.** This runbook is verified manually. The Neon-era drill (below) validated a mechanism that no longer exists — a fresh Supabase restore drill is due.

---

## Drill log

### 2026-05-28 — initial drill (Neon era — mechanism retired)

> **Historical.** This drill validated Neon's branch-create + PITR path, which no longer applies after the 2026-07-01 move to Supabase. Kept for the record. A Supabase `pg_dump` restore drill is outstanding (see Gaps).

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

**Result:** restore path worked on Neon. Superseded by the Supabase migration; a new drill is due.
