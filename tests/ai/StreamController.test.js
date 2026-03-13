import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger
vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

// Mock constants
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle',
}));

// Mock SensitiveDataFilter (required by Logger)
vi.mock('../../scripts/utils/SensitiveDataFilter.mjs', () => ({
  SensitiveDataFilter: {
    sanitizeArgs: (...args) => args,
    sanitizeString: (s) => s,
  },
}));

import { StreamController } from '../../scripts/ai/StreamController.mjs';

// --- Test helpers ---

/** Create a mock async iterator that yields tokens */
async function* mockStream(tokens, delayMs = 0) {
  for (const token of tokens) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    yield { token, done: false };
  }
}

/** Create a mock async iterator that throws an error after some tokens */
async function* errorStream(tokens, errorAfter) {
  let count = 0;
  for (const token of tokens) {
    if (count === errorAfter) throw new Error('Stream exploded');
    yield { token, done: false };
    count++;
  }
}

/** Create a mock EventBus */
function createMockEventBus() {
  return { emit: vi.fn() };
}

// --- Setup ---

describe('StreamController', () => {
  let target;
  let originalRAF;
  let originalCAF;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });

    // Mock requestAnimationFrame / cancelAnimationFrame (not in jsdom)
    originalRAF = globalThis.requestAnimationFrame;
    originalCAF = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16));
    globalThis.cancelAnimationFrame = vi.fn((id) => clearTimeout(id));

    // Create target element
    target = document.createElement('div');
    // Make it scrollable for auto-scroll tests
    Object.defineProperty(target, 'scrollHeight', { value: 500, writable: true, configurable: true });
    Object.defineProperty(target, 'clientHeight', { value: 200, writable: true, configurable: true });
    target.scrollTop = 300; // at bottom (scrollHeight - clientHeight)
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.requestAnimationFrame = originalRAF;
    globalThis.cancelAnimationFrame = originalCAF;
  });

  // --- 1. Constructor ---

  describe('constructor', () => {
    it('throws if targetElement is not provided', () => {
      expect(() => new StreamController(null)).toThrow('targetElement is required');
    });

    it('creates instance with default options', () => {
      const sc = new StreamController(target);
      expect(sc.state).toBe('idle');
      expect(sc.fullText).toBe('');
    });

    it('accepts custom flushInterval', () => {
      const sc = new StreamController(target, { flushInterval: 32 });
      expect(sc.state).toBe('idle');
    });
  });

  // --- 2. State machine ---

  describe('state management', () => {
    it('transitions idle → streaming → complete', async () => {
      const sc = new StreamController(target);
      expect(sc.state).toBe('idle');

      const promise = sc.stream(mockStream(['Hello']));
      expect(sc.state).toBe('streaming');

      await vi.runAllTimersAsync();
      await promise;

      expect(sc.state).toBe('complete');
    });

    it('transitions idle → streaming → cancelled', async () => {
      const sc = new StreamController(target);

      // Create a slow stream so we can cancel mid-stream
      const slowStream = (async function* () {
        yield { token: 'Hello', done: false };
        await new Promise((r) => setTimeout(r, 1000));
        yield { token: ' world', done: false };
      })();

      const promise = sc.stream(slowStream);
      // Let first token arrive
      await vi.advanceTimersByTimeAsync(20);

      sc.cancel();
      expect(sc.state).toBe('cancelled');

      await vi.runAllTimersAsync();
      await promise;
    });

    it('transitions idle → streaming → error', async () => {
      const sc = new StreamController(target);

      const promise = sc.stream(errorStream(['a'], 0));
      await vi.runAllTimersAsync();
      await promise;

      expect(sc.state).toBe('error');
    });

    it('throws if stream() called while already streaming', async () => {
      const sc = new StreamController(target);

      const slowStream = (async function* () {
        yield { token: 'x', done: false };
        await new Promise((r) => setTimeout(r, 5000));
      })();

      sc.stream(slowStream);
      await vi.advanceTimersByTimeAsync(16);

      await expect(sc.stream(mockStream(['y']))).rejects.toThrow('Already streaming');

      sc.cancel();
      await vi.runAllTimersAsync();
    });
  });

  // --- 3. Buffering and DOM updates ---

  describe('buffering and flush', () => {
    it('batches multiple tokens into single DOM update', async () => {
      const sc = new StreamController(target);

      // Stream tokens rapidly (no delay between them)
      const promise = sc.stream(mockStream(['Hello', ' ', 'world']));
      await vi.runAllTimersAsync();
      await promise;

      // All tokens should end up in textContent
      expect(target.textContent).toBe('Hello world');
    });

    it('accumulates fullText across all tokens', async () => {
      const sc = new StreamController(target);

      const promise = sc.stream(mockStream(['Hello', ' ', 'world', '!']));
      await vi.runAllTimersAsync();
      await promise;

      expect(sc.fullText).toBe('Hello world!');
    });

    it('uses textContent (NOT innerHTML) for XSS safety', async () => {
      const sc = new StreamController(target);

      const promise = sc.stream(mockStream(['<script>alert("xss")</script>']));
      await vi.runAllTimersAsync();
      await promise;

      // Should be plain text, not parsed HTML
      expect(target.textContent).toContain('<script>');
      expect(target.innerHTML).not.toContain('<script>alert');
    });
  });

  // --- 4. Cancellation ---

  describe('cancellation', () => {
    it('cancel() aborts and cleans up', async () => {
      const sc = new StreamController(target);

      const slowStream = (async function* () {
        yield { token: 'Start', done: false };
        await new Promise((r) => setTimeout(r, 5000));
        yield { token: ' End', done: false };
      })();

      const promise = sc.stream(slowStream);
      await vi.advanceTimersByTimeAsync(20);

      sc.cancel();
      expect(sc.state).toBe('cancelled');

      await vi.runAllTimersAsync();
      await promise;
    });

    it('cancel() is no-op when not streaming', () => {
      const sc = new StreamController(target);
      sc.cancel(); // Should not throw
      expect(sc.state).toBe('idle');
    });

    it('external AbortSignal triggers cancellation', async () => {
      const sc = new StreamController(target);
      const externalAC = new AbortController();

      const slowStream = (async function* () {
        yield { token: 'x', done: false };
        await new Promise((r) => setTimeout(r, 5000));
        yield { token: 'y', done: false };
      })();

      const promise = sc.stream(slowStream, externalAC.signal);
      await vi.advanceTimersByTimeAsync(20);

      externalAC.abort();
      await vi.advanceTimersByTimeAsync(20);

      expect(sc.state).toBe('cancelled');
      await vi.runAllTimersAsync();
      await promise;
    });
  });

  // --- 5. Reset ---

  describe('reset', () => {
    it('resets state to idle and clears element', async () => {
      const sc = new StreamController(target);

      const promise = sc.stream(mockStream(['Hello']));
      await vi.runAllTimersAsync();
      await promise;

      expect(sc.state).toBe('complete');
      expect(target.textContent).toBe('Hello');

      sc.reset();
      expect(sc.state).toBe('idle');
      expect(sc.fullText).toBe('');
      expect(target.textContent).toBe('');
    });

    it('removes all CSS classes on reset', async () => {
      const sc = new StreamController(target);

      const promise = sc.stream(mockStream(['Hi']));
      await vi.runAllTimersAsync();
      await promise;

      sc.reset();
      expect(target.classList.contains('vox-chronicle-stream')).toBe(false);
      expect(target.classList.contains('vox-chronicle-stream--active')).toBe(false);
      expect(target.classList.contains('vox-chronicle-stream--complete')).toBe(false);
    });

    it('removes aria-live on reset', async () => {
      const sc = new StreamController(target);

      const promise = sc.stream(mockStream(['x']));
      await vi.runAllTimersAsync();
      await promise;

      expect(target.getAttribute('aria-live')).toBe('polite');
      sc.reset();
      expect(target.hasAttribute('aria-live')).toBe(false);
    });
  });

  // --- 6. CSS classes ---

  describe('CSS classes', () => {
    it('adds stream and active classes on stream start', async () => {
      const sc = new StreamController(target);

      const slowStream = (async function* () {
        yield { token: 'x', done: false };
        await new Promise((r) => setTimeout(r, 5000));
      })();

      const promise = sc.stream(slowStream);
      await vi.advanceTimersByTimeAsync(5);

      expect(target.classList.contains('vox-chronicle-stream')).toBe(true);
      expect(target.classList.contains('vox-chronicle-stream--active')).toBe(true);

      sc.cancel();
      await vi.runAllTimersAsync();
      await promise;
    });

    it('switches to complete class on stream end', async () => {
      const sc = new StreamController(target);

      const promise = sc.stream(mockStream(['Done']));
      await vi.runAllTimersAsync();
      await promise;

      expect(target.classList.contains('vox-chronicle-stream--active')).toBe(false);
      expect(target.classList.contains('vox-chronicle-stream--complete')).toBe(true);
    });

    it('removes active class on cancel', async () => {
      const sc = new StreamController(target);

      const slowStream = (async function* () {
        yield { token: 'a', done: false };
        await new Promise((r) => setTimeout(r, 5000));
      })();

      const promise = sc.stream(slowStream);
      await vi.advanceTimersByTimeAsync(20);

      sc.cancel();
      expect(target.classList.contains('vox-chronicle-stream--active')).toBe(false);

      await vi.runAllTimersAsync();
      await promise;
    });
  });

  // --- 7. Accessibility ---

  describe('accessibility', () => {
    it('sets aria-live="polite" during streaming', async () => {
      const sc = new StreamController(target);

      const slowStream = (async function* () {
        yield { token: 'x', done: false };
        await new Promise((r) => setTimeout(r, 5000));
      })();

      const promise = sc.stream(slowStream);
      await vi.advanceTimersByTimeAsync(5);

      expect(target.getAttribute('aria-live')).toBe('polite');

      sc.cancel();
      await vi.runAllTimersAsync();
      await promise;
    });
  });

  // --- 8. EventBus integration ---

  describe('EventBus integration', () => {
    it('emits ai:streamStart on stream begin', async () => {
      const bus = createMockEventBus();
      const sc = new StreamController(target, { eventBus: bus });

      const promise = sc.stream(mockStream(['Hello']));
      await vi.runAllTimersAsync();
      await promise;

      expect(bus.emit).toHaveBeenCalledWith('ai:streamStart', expect.objectContaining({
        targetElement: target,
        timestamp: expect.any(Number),
      }));
    });

    it('emits ai:token on flush', async () => {
      const bus = createMockEventBus();
      const sc = new StreamController(target, { eventBus: bus });

      const promise = sc.stream(mockStream(['Hello', ' world']));
      await vi.runAllTimersAsync();
      await promise;

      const tokenCalls = bus.emit.mock.calls.filter(([name]) => name === 'ai:token');
      expect(tokenCalls.length).toBeGreaterThanOrEqual(1);
      expect(tokenCalls[0][1]).toHaveProperty('tokens');
      expect(tokenCalls[0][1]).toHaveProperty('charCount');
    });

    it('emits ai:streamEnd on completion', async () => {
      const bus = createMockEventBus();
      const sc = new StreamController(target, { eventBus: bus });

      const promise = sc.stream(mockStream(['Done']));
      await vi.runAllTimersAsync();
      await promise;

      expect(bus.emit).toHaveBeenCalledWith('ai:streamEnd', expect.objectContaining({
        fullText: 'Done',
        charCount: 4,
        duration: expect.any(Number),
      }));
    });

    it('emits ai:streamEnd with cancelled flag on cancel', async () => {
      const bus = createMockEventBus();
      const sc = new StreamController(target, { eventBus: bus });

      const slowStream = (async function* () {
        yield { token: 'x', done: false };
        await new Promise((r) => setTimeout(r, 5000));
      })();

      const promise = sc.stream(slowStream);
      await vi.advanceTimersByTimeAsync(20);
      sc.cancel();

      await vi.runAllTimersAsync();
      await promise;

      expect(bus.emit).toHaveBeenCalledWith('ai:streamEnd', expect.objectContaining({
        cancelled: true,
      }));
    });

    it('emits ai:streamError on error', async () => {
      const bus = createMockEventBus();
      const sc = new StreamController(target, { eventBus: bus });

      const promise = sc.stream(errorStream(['a'], 0));
      await vi.runAllTimersAsync();
      await promise;

      expect(bus.emit).toHaveBeenCalledWith('ai:streamError', expect.objectContaining({
        error: expect.any(Error),
        partialText: expect.any(String),
      }));
    });
  });

  // --- 9. Works without EventBus ---

  describe('without EventBus', () => {
    it('streams correctly without eventBus option', async () => {
      const sc = new StreamController(target);

      const promise = sc.stream(mockStream(['No', ' bus']));
      await vi.runAllTimersAsync();
      await promise;

      expect(sc.state).toBe('complete');
      expect(sc.fullText).toBe('No bus');
      expect(target.textContent).toBe('No bus');
    });
  });

  // --- 10. Auto-scroll ---

  describe('auto-scroll', () => {
    it('scrolls to bottom during streaming when at bottom', async () => {
      const sc = new StreamController(target);

      // Mock scrollHeight to increase as content is added
      let scrollTopSet = 0;
      Object.defineProperty(target, 'scrollTop', {
        get: () => scrollTopSet,
        set: (v) => { scrollTopSet = v; },
        configurable: true,
      });
      Object.defineProperty(target, 'scrollHeight', { value: 500, configurable: true });
      Object.defineProperty(target, 'clientHeight', { value: 200, configurable: true });
      // Start at bottom
      scrollTopSet = 300;

      const promise = sc.stream(mockStream(['Token1', ' Token2']));
      await vi.runAllTimersAsync();
      await promise;

      // scrollTop should have been set to scrollHeight (500)
      expect(scrollTopSet).toBe(500);
    });

    it('does NOT auto-scroll when user has scrolled up', async () => {
      const sc = new StreamController(target);

      let scrollTopSet = 0;
      Object.defineProperty(target, 'scrollTop', {
        get: () => scrollTopSet,
        set: (v) => { scrollTopSet = v; },
        configurable: true,
      });
      Object.defineProperty(target, 'scrollHeight', { value: 500, configurable: true });
      Object.defineProperty(target, 'clientHeight', { value: 200, configurable: true });
      // User scrolled up — NOT at bottom (threshold is 10)
      scrollTopSet = 100;

      const promise = sc.stream(mockStream(['Token1']));
      await vi.runAllTimersAsync();
      await promise;

      // scrollTop should NOT have been changed
      expect(scrollTopSet).toBe(100);
    });
  });

  // --- 11. Callbacks ---

  describe('callbacks', () => {
    it('calls onToken for each token', async () => {
      const onToken = vi.fn();
      const sc = new StreamController(target, { onToken });

      const promise = sc.stream(mockStream(['A', 'B', 'C']));
      await vi.runAllTimersAsync();
      await promise;

      expect(onToken).toHaveBeenCalledTimes(3);
      expect(onToken).toHaveBeenCalledWith('A');
      expect(onToken).toHaveBeenCalledWith('B');
      expect(onToken).toHaveBeenCalledWith('C');
    });

    it('calls onComplete when stream finishes', async () => {
      const onComplete = vi.fn();
      const sc = new StreamController(target, { onComplete });

      const promise = sc.stream(mockStream(['Done']));
      await vi.runAllTimersAsync();
      await promise;

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
        fullText: 'Done',
      }));
    });

    it('calls onError when stream errors', async () => {
      const onError = vi.fn();
      const sc = new StreamController(target, { onError });

      const promise = sc.stream(errorStream(['a'], 0));
      await vi.runAllTimersAsync();
      await promise;

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // --- 12. Sequential streams ---

  describe('sequential streams', () => {
    it('second stream works after first completes', async () => {
      const sc = new StreamController(target);

      // First stream
      const p1 = sc.stream(mockStream(['First']));
      await vi.runAllTimersAsync();
      await p1;
      expect(sc.state).toBe('complete');

      // Reset and second stream
      sc.reset();
      const p2 = sc.stream(mockStream(['Second']));
      await vi.runAllTimersAsync();
      await p2;

      expect(sc.state).toBe('complete');
      expect(sc.fullText).toBe('Second');
      expect(target.textContent).toBe('Second');
    });
  });

  // --- 13. Error from iterator ---

  describe('error handling', () => {
    it('handles error mid-stream with partial text', async () => {
      const sc = new StreamController(target);

      const errStream = (async function* () {
        yield { token: 'partial', done: false };
        throw new Error('mid-stream failure');
      })();

      const promise = sc.stream(errStream);
      await vi.runAllTimersAsync();
      await promise;

      expect(sc.state).toBe('error');
      expect(sc.fullText).toBe('partial');
    });

    it('emits ai:streamEnd after ai:streamError on error path', async () => {
      const bus = createMockEventBus();
      const sc = new StreamController(target, { eventBus: bus });

      const promise = sc.stream(errorStream(['a'], 0));
      await vi.runAllTimersAsync();
      await promise;

      const errorCalls = bus.emit.mock.calls.filter(([n]) => n === 'ai:streamError');
      const endCalls = bus.emit.mock.calls.filter(([n]) => n === 'ai:streamEnd');
      expect(errorCalls.length).toBe(1);
      expect(endCalls.length).toBe(1);
      expect(endCalls[0][1]).toHaveProperty('error', true);
    });
  });

  // --- 14. Edge cases ---

  describe('edge cases', () => {
    it('handles done:true sentinel and stops processing', async () => {
      const sc = new StreamController(target);

      const stream = (async function* () {
        yield { token: 'keep', done: false };
        yield { token: 'stop', done: true };
        yield { token: 'SHOULD_NOT_APPEAR', done: false };
      })();

      const promise = sc.stream(stream);
      await vi.runAllTimersAsync();
      await promise;

      expect(sc.state).toBe('complete');
      expect(sc.fullText).toBe('keep');
      expect(target.textContent).not.toContain('SHOULD_NOT_APPEAR');
    });

    it('handles empty stream (zero tokens)', async () => {
      const sc = new StreamController(target);

      const promise = sc.stream(mockStream([]));
      await vi.runAllTimersAsync();
      await promise;

      expect(sc.state).toBe('complete');
      expect(sc.fullText).toBe('');
      expect(target.textContent).toBe('');
    });

    it('reset() during active streaming aborts iterator', async () => {
      const sc = new StreamController(target);

      const slowStream = (async function* () {
        yield { token: 'first', done: false };
        await new Promise((r) => setTimeout(r, 5000));
        yield { token: 'ZOMBIE', done: false };
      })();

      const promise = sc.stream(slowStream);
      await vi.advanceTimersByTimeAsync(20);

      sc.reset();
      expect(sc.state).toBe('idle');

      await vi.runAllTimersAsync();
      await promise;

      // ZOMBIE should not appear because reset() aborts the iterator
      expect(target.textContent).toBe('');
      expect(sc.fullText).toBe('');
    });

    it('double cancel() does not emit ai:streamEnd twice', async () => {
      const bus = createMockEventBus();
      const sc = new StreamController(target, { eventBus: bus });

      const slowStream = (async function* () {
        yield { token: 'x', done: false };
        await new Promise((r) => setTimeout(r, 5000));
      })();

      const promise = sc.stream(slowStream);
      await vi.advanceTimersByTimeAsync(20);

      sc.cancel();
      sc.cancel(); // second cancel should be no-op

      await vi.runAllTimersAsync();
      await promise;

      const endCalls = bus.emit.mock.calls.filter(([n]) => n === 'ai:streamEnd');
      expect(endCalls.length).toBe(1);
    });

    it('skips non-string tokens without corruption', async () => {
      const sc = new StreamController(target);

      const stream = (async function* () {
        yield { token: 'valid', done: false };
        yield { token: null, done: false };
        yield { token: undefined, done: false };
        yield { token: 42, done: false };
        yield { token: 'end', done: false };
      })();

      const promise = sc.stream(stream);
      await vi.runAllTimersAsync();
      await promise;

      expect(sc.fullText).toBe('validend');
      expect(target.textContent).not.toContain('null');
      expect(target.textContent).not.toContain('undefined');
    });

    it('onToken callback error does not kill the stream', async () => {
      const onToken = vi.fn().mockImplementationOnce(() => {
        throw new Error('callback bug');
      });
      const sc = new StreamController(target, { onToken });

      const promise = sc.stream(mockStream(['A', 'B']));
      await vi.runAllTimersAsync();
      await promise;

      // Stream should complete despite callback error
      expect(sc.state).toBe('complete');
      expect(sc.fullText).toBe('AB');
    });

    it('EventBus emit error does not kill the stream', async () => {
      const bus = { emit: vi.fn().mockImplementationOnce(() => { throw new Error('bus boom'); }) };
      const sc = new StreamController(target, { eventBus: bus });

      const promise = sc.stream(mockStream(['Hello']));
      await vi.runAllTimersAsync();
      await promise;

      expect(sc.state).toBe('complete');
      expect(sc.fullText).toBe('Hello');
    });

    it('ai:streamEnd includes cancelled:false on normal completion', async () => {
      const bus = createMockEventBus();
      const sc = new StreamController(target, { eventBus: bus });

      const promise = sc.stream(mockStream(['x']));
      await vi.runAllTimersAsync();
      await promise;

      const endCall = bus.emit.mock.calls.find(([n]) => n === 'ai:streamEnd');
      expect(endCall[1].cancelled).toBe(false);
    });

    it('flushInterval throttles flush rate', async () => {
      const bus = createMockEventBus();
      // Use 64ms interval — only flush every ~4 frames at 16ms/frame
      const sc = new StreamController(target, { eventBus: bus, flushInterval: 64 });

      const slowStream = (async function* () {
        yield { token: 'A', done: false };
        await new Promise((r) => setTimeout(r, 16));
        yield { token: 'B', done: false };
        await new Promise((r) => setTimeout(r, 16));
        yield { token: 'C', done: false };
        await new Promise((r) => setTimeout(r, 16));
        yield { token: 'D', done: false };
      })();

      const promise = sc.stream(slowStream);
      await vi.runAllTimersAsync();
      await promise;

      // All tokens should arrive despite throttling
      expect(sc.fullText).toBe('ABCD');
      // But fewer ai:token events due to batching (flush happens less often)
      const tokenCalls = bus.emit.mock.calls.filter(([n]) => n === 'ai:token');
      // With 64ms interval, tokens arriving at 16ms intervals get batched more
      expect(tokenCalls.length).toBeLessThanOrEqual(4);
    });
  });
});
