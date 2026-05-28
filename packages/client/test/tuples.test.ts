import { describe, expect, it } from 'vitest';
import {
  LOOP_ACTIONS,
  LOOP_CATEGORIES,
  LOOP_EVENT_STATUSES,
  LOOP_EVENT_TYPES,
  LOOP_SEVERITIES,
  type LoopAction,
  type LoopCategory,
  type LoopEventStatus,
  type LoopEventType,
  type LoopSeverity,
} from '../src/types';

// ─── Compile-time guardrails ──────────────────────────────────────────────
// If the tuple values drift away from the derived types, these `satisfies`
// blocks fail at type-check time.

const _categoryCheck = [...LOOP_CATEGORIES] satisfies LoopCategory[];
const _severityCheck = [...LOOP_SEVERITIES] satisfies LoopSeverity[];
const _actionCheck = [...LOOP_ACTIONS] satisfies LoopAction[];
const _eventTypeCheck = [...LOOP_EVENT_TYPES] satisfies LoopEventType[];
const _eventStatusCheck = [...LOOP_EVENT_STATUSES] satisfies LoopEventStatus[];
void _categoryCheck;
void _severityCheck;
void _actionCheck;
void _eventTypeCheck;
void _eventStatusCheck;

describe('Loop taxonomy tuples', () => {
  // Canonical sets — hardcoded so that any taxonomy change requires explicitly
  // updating this file as a deliberate guardrail.
  it('LOOP_CATEGORIES matches the canonical Loop service taxonomy', () => {
    expect([...LOOP_CATEGORIES].sort()).toEqual(
      ['bookings', 'errors', 'feedback', 'ops', 'revenue', 'seo', 'users'].sort(),
    );
  });

  it('LOOP_SEVERITIES matches info/warning/error', () => {
    expect([...LOOP_SEVERITIES].sort()).toEqual(['error', 'info', 'warning']);
  });

  it('LOOP_ACTIONS matches the canonical action set', () => {
    expect([...LOOP_ACTIONS].sort()).toEqual(['autofix', 'issue', 'remind', 'todo']);
  });

  it('LOOP_EVENT_TYPES matches the canonical event type set', () => {
    expect([...LOOP_EVENT_TYPES].sort()).toEqual(
      [
        'booking',
        'contact',
        'cron',
        'error',
        'feedback',
        'generic',
        'infra',
        'raw',
        'seo_report',
        'signup',
        'subscription',
      ].sort(),
    );
  });

  it('LOOP_EVENT_STATUSES matches the canonical server-side delivery statuses', () => {
    expect([...LOOP_EVENT_STATUSES].sort()).toEqual(
      ['digested', 'duplicate', 'failed', 'posted', 'skipped'].sort(),
    );
  });

  it('all tuples contain unique values', () => {
    for (const tuple of [LOOP_CATEGORIES, LOOP_SEVERITIES, LOOP_ACTIONS, LOOP_EVENT_TYPES, LOOP_EVENT_STATUSES]) {
      expect(new Set(tuple).size).toBe(tuple.length);
    }
  });
});
