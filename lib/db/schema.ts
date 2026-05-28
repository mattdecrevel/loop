import { sql } from 'drizzle-orm';
import {
  boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar,
} from 'drizzle-orm/pg-core';

export const eventCategory = pgEnum('event_category', [
  'users', 'revenue', 'feedback', 'errors', 'seo', 'ops', 'bookings',
]);
export const eventSeverity = pgEnum('event_severity', ['info', 'warning', 'error']);
export const eventStatus = pgEnum('event_status', ['posted', 'skipped', 'digested', 'failed']);
export const todoStatus = pgEnum('todo_status', ['open', 'done']);
export const reminderStatus = pgEnum('reminder_status', ['pending', 'sent', 'cancelled']);

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  name: text('name').notNull(),
  apiKeyHash: text('api_key_hash').notNull().unique(),
  githubRepo: text('github_repo'),          // "owner/repo" — Phase 2 issue creation
  linearTeam: text('linear_team'),          // Phase 3 seam
  autofixEnabled: boolean('autofix_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const channels = pgTable('channels', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 64 }).notNull().unique(),   // logical, e.g. "users"
  slackChannelId: text('slack_channel_id').notNull(),         // e.g. "C0123ABCD"
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Routing rules. project_id NULL = global; category NULL = all categories.
// Resolution precedence is computed in lib/routing.ts.
export const routes = pgTable('routes', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  category: eventCategory('category'),
  targetChannelId: uuid('target_channel_id').references(() => channels.id),
  targetWebhookUrl: text('target_webhook_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 32 }).notNull(),
  category: eventCategory('category').notNull(),
  severity: eventSeverity('severity').notNull().default('info'),
  payload: jsonb('payload').notNull(),
  status: eventStatus('status').notNull(),
  slackTs: text('slack_ts'),
  slackChannelId: text('slack_channel_id'),
  githubIssueNumber: integer('github_issue_number'),   // Phase 2
  githubIssueUrl: text('github_issue_url'),             // Phase 2
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),  // Phase 2
  idempotencyKey: text('idempotency_key'),
  digest: boolean('digest').notNull().default(false),
  digestPostedAt: timestamp('digest_posted_at', { withTimezone: true }),   // Phase 3 — set by the digest cron
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Enforce idempotency per project: a given (project_id, idempotency_key) pair
  // can only appear once. Partial — rows with NULL idempotency_key are ignored.
  uniqueIndex('events_project_idempotency_unique')
    .on(t.projectId, t.idempotencyKey)
    .where(sql`idempotency_key IS NOT NULL`),
]);

export const todos = pgTable('todos', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  status: todoStatus('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const reminders = pgTable('reminders', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  channelId: text('channel_id').notNull(),
  messageTs: text('message_ts'),
  remindAt: timestamp('remind_at', { withTimezone: true }).notNull(),
  status: reminderStatus('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});
