/**
 * Mock tracker helper to ensure mocks are properly cleaned up between tests
 * This solves the state isolation problem in test suites
 */

type MockType = {
  mockRestore: () => void;
};

export class MockTracker {
  private mocks: MockType[] = [];

  /**
   * Add a mock to be tracked and cleaned up
   */
  add<T extends MockType>(mock: T): T {
    this.mocks.push(mock);
    return mock;
  }

  /**
   * Restore all tracked mocks
   */
  restore(): void {
    for (const mock of this.mocks) {
      try {
        mock.mockRestore();
      } catch (_e) {
        // Mock already restored, ignore
      }
    }
    this.mocks.length = 0;
  }

  /**
   * Get count of tracked mocks
   */
  count(): number {
    return this.mocks.length;
  }
}

/**
 * Create a new mock tracker instance
 */
export function createMockTracker(): MockTracker {
  return new MockTracker();
}
