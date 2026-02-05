import { db } from '../../db/index.js';

/**
 * Keep track of all spies created during tests
 * This is a global registry to ensure complete cleanup
 */
let globalSpies: Array<{ mockRestore: () => void }> = [];

/**
 * Completely reset all spies/mocks created in any test
 * This should be called in beforeEach to ensure isolation between test files
 */
export function resetAllDbMocks(): void {
  // First, try to restore all globally tracked spies
  for (const spy of globalSpies) {
    try {
      spy.mockRestore();
    } catch (_e) {
      // Already restored or error during restore
    }
  }
  globalSpies = [];

  // Then try to manually reset known db query objects
  for (const [, queryObj] of Object.entries(db.query)) {
    if (queryObj && typeof queryObj === 'object') {
      for (const [, fn] of Object.entries(queryObj)) {
        if (typeof fn === 'function' && (fn as any).mockRestore) {
          try {
            (fn as any).mockRestore();
          } catch (_e) {
            // Already restored
          }
        }
      }
    }
  }

  // Reset db.select if it's spied on
  if (db.select && typeof (db.select as any).mockRestore === 'function') {
    try {
      (db.select as any).mockRestore();
    } catch (_e) {
      // Already restored
    }
  }
}

/**
 * Register a spy for global cleanup
 * Call this when creating spies in tests to ensure they're cleaned up
 */
export function trackSpy(spy: { mockRestore: () => void }): void {
  globalSpies.push(spy);
}

/**
 * Get current global spies registry (for debugging)
 */
export function getGlobalSpies(): Array<{ mockRestore: () => void }> {
  return [...globalSpies];
}
