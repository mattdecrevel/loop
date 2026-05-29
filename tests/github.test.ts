import { describe, it, expect } from 'vitest';
import { buildIssue } from '@/lib/github';

describe('buildIssue', () => {
  it('builds an error issue with a [Error] title prefix and a bug label', () => {
    const issue = buildIssue('error', { message: 'Cannot read foo', route: '/api/x', stack: 'Error: boom\n  at f' });
    expect(issue.title.startsWith('[Error]')).toBe(true);
    expect(issue.title).toContain('Cannot read foo');
    expect(issue.labels).toContain('bug');
    expect(issue.body).toContain('Cannot read foo');
    expect(issue.body).toContain('/api/x');
    expect(issue.body).toContain('boom');
  });

  it('builds a feedback issue with a user-feedback label', () => {
    const issue = buildIssue('feedback', { category: 'bug', message: 'toggle resets', steps: ['open', 'click'] });
    expect(issue.labels).toContain('user-feedback');
    expect(issue.body).toContain('toggle resets');
    expect(issue.body).toContain('open');
    expect(issue.body).toContain('click');
  });

  it('includes captured console errors in a feedback issue body', () => {
    const issue = buildIssue('feedback', {
      category: 'bug',
      message: 'toggle resets',
      consoleErrors: ['TypeError: cannot read x', 'Warning: deprecated API'],
    });
    expect(issue.body).toContain('Console errors');
    expect(issue.body).toContain('TypeError: cannot read x');
    expect(issue.body).toContain('Warning: deprecated API');
  });

  it('falls back to a generic issue for unknown types', () => {
    const issue = buildIssue('mystery', { title: 'Something', body: 'happened' });
    expect(typeof issue.title).toBe('string');
    expect(issue.title.length).toBeGreaterThan(0);
    expect(Array.isArray(issue.labels)).toBe(true);
  });
});
