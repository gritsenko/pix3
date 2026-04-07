import { describe, expect, it } from 'vitest';

import { isSystemParticipantName } from './collab-status-bar';

describe('collab-status-bar participant filtering', () => {
  it('filters the generic Pix3 host participant', () => {
    expect(isSystemParticipantName('Pix3 Host')).toBe(true);
  });

  it('filters the project-scoped host participant', () => {
    expect(isSystemParticipantName('New Project 1 Host', 'New Project 1')).toBe(true);
  });

  it('keeps real users visible', () => {
    expect(isSystemParticipantName('Igor', 'New Project 1')).toBe(false);
    expect(isSystemParticipantName('New Project 1 Hostess', 'New Project 1')).toBe(false);
  });
});
