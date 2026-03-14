/**
 * StreamController - Streaming text rendering engine
 *
 * Consumes async iterators from ChatProvider.chatStream() and renders
 * tokens to a DOM element with buffered flushing via requestAnimationFrame.
 *
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

export class StreamController {
  #target;
  #options;
  #buffer = '';
  #fullText = '';
  #state = 'idle'; // idle | streaming | complete | cancelled | error
  #abortController = null;
  #rafId = null;
  #logger;
  #eventBus;
  #startTime = 0;
  #lastFlushTime = 0;
  #externalAbortSignal = null;
  #externalAbortHandler = null;

  /**
   * @param {HTMLElement} targetElement - DOM element to render streaming text into
   * @param {object} [options={}]
   * @param {number} [options.flushInterval=16] - Minimum ms between flushes (16ms = 60fps)
   * @param {Function} [options.onToken] - Called for each token received
   * @param {Function} [options.onComplete] - Called when stream completes
   * @param {Function} [options.onError] - Called on stream error
   * @param {object} [options.eventBus] - EventBus instance for emitting events
   */
  constructor(targetElement, options = {}) {
    if (!targetElement) throw new Error('targetElement is required');
    this.#target = targetElement;
    this.#options = {
      flushInterval: options.flushInterval ?? 16,
      onToken: options.onToken ?? null,
      onComplete: options.onComplete ?? null,
      onError: options.onError ?? null
    };
    this.#eventBus = options.eventBus ?? null;
    this.#logger = Logger.createChild('StreamController');
  }

  /** @returns {'idle'|'streaming'|'complete'|'cancelled'|'error'} */
  get state() {
    return this.#state;
  }

  /** @returns {string} All text accumulated during streaming */
  get fullText() {
    return this.#fullText;
  }

  /**
   * Consume an async iterator and render tokens to DOM.
   * @param {AsyncIterable<{token: string, done: boolean}>} asyncIterator
   * @param {AbortSignal} [abortSignal] - External abort signal
   */
  async stream(asyncIterator, abortSignal) {
    if (this.#state === 'streaming') {
      throw new Error('Already streaming — call cancel() or reset() first');
    }

    this.#buffer = '';
    this.#fullText = '';
    this.#startTime = performance.now();
    this.#lastFlushTime = 0;
    this.#abortController = new AbortController();

    // Link external abort signal if provided
    if (abortSignal) {
      this.#externalAbortSignal = abortSignal;
      this.#externalAbortHandler = () => this.cancel();
      abortSignal.addEventListener('abort', this.#externalAbortHandler, { once: true });
    }

    // Set state AFTER initialization — prevents stuck 'streaming' on init failure
    this.#state = 'streaming';

    // Add CSS classes and accessibility
    this.#target.classList.add('vox-chronicle-stream', 'vox-chronicle-stream--active');
    this.#target.setAttribute('aria-live', 'polite');

    this.#emitSafe('ai:streamStart', {
      targetElement: this.#target,
      timestamp: Date.now()
    });

    // Start flush loop
    this.#startFlushLoop();

    try {
      for await (const chunk of asyncIterator) {
        if (this.#abortController.signal.aborted) break;
        if (!chunk || chunk.done) break;

        const token = typeof chunk.token === 'string' ? chunk.token : '';
        if (token.length === 0) continue;

        this.#buffer += token;
        this.#fullText += token;
        this.#callbackSafe('onToken', token);
      }

      if (this.#state === 'streaming') {
        this.#flush();
        this.#complete();
      }
    } catch (error) {
      if (this.#state !== 'cancelled') {
        this.#handleError(error);
      }
    } finally {
      this.#removeExternalAbortListener();
    }
  }

  /**
   * Cancel the current stream.
   */
  cancel() {
    if (this.#state !== 'streaming') return;
    this.#abortController?.abort();
    this.#state = 'cancelled';
    this.#stopFlushLoop();
    this.#flush();
    this.#removeCursor();
    this.#removeExternalAbortListener();

    this.#emitSafe('ai:streamEnd', {
      fullText: this.#fullText,
      charCount: this.#fullText.length,
      duration: performance.now() - this.#startTime,
      cancelled: true
    });
  }

  /**
   * Reset to idle state and clear the target element.
   */
  reset() {
    this.#abortController?.abort();
    this.#stopFlushLoop();
    this.#removeExternalAbortListener();
    this.#state = 'idle';
    this.#buffer = '';
    this.#fullText = '';
    this.#target.textContent = '';
    this.#target.classList.remove(
      'vox-chronicle-stream',
      'vox-chronicle-stream--active',
      'vox-chronicle-stream--complete'
    );
    this.#target.removeAttribute('aria-live');
  }

  // --- Private methods ---

  #startFlushLoop() {
    const interval = this.#options.flushInterval;
    const flushTick = () => {
      if (this.#state !== 'streaming') return;
      try {
        const now = performance.now();
        if (now - this.#lastFlushTime >= interval) {
          this.#flush();
          this.#lastFlushTime = now;
        }
      } catch (error) {
        this.#logger.warn('Flush loop error:', error);
      }
      this.#rafId = requestAnimationFrame(flushTick);
    };
    this.#rafId = requestAnimationFrame(flushTick);
  }

  #stopFlushLoop() {
    if (this.#rafId !== null) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
  }

  #flush() {
    if (this.#buffer.length === 0) return;
    const text = this.#buffer;
    this.#buffer = '';

    // Append via Text node — O(1), XSS safe, non-destructive
    this.#target.appendChild(document.createTextNode(text));

    // Auto-scroll if user is at bottom
    if (this.#isScrolledToBottom()) {
      this.#target.scrollTop = this.#target.scrollHeight;
    }

    this.#emitSafe('ai:token', {
      tokens: text,
      charCount: this.#fullText.length
    });
  }

  #complete() {
    this.#state = 'complete';
    this.#stopFlushLoop();
    this.#removeCursor();

    this.#target.classList.remove('vox-chronicle-stream--active');
    this.#target.classList.add('vox-chronicle-stream--complete');

    const duration = performance.now() - this.#startTime;

    this.#emitSafe('ai:streamEnd', {
      fullText: this.#fullText,
      charCount: this.#fullText.length,
      duration,
      cancelled: false
    });

    this.#callbackSafe('onComplete', {
      fullText: this.#fullText,
      charCount: this.#fullText.length,
      duration
    });

    this.#logger.debug('Stream complete', { chars: this.#fullText.length, duration });
  }

  #handleError(error) {
    this.#state = 'error';
    this.#stopFlushLoop();
    this.#flush();
    this.#removeCursor();

    this.#emitSafe('ai:streamError', {
      error,
      partialText: this.#fullText
    });

    this.#emitSafe('ai:streamEnd', {
      fullText: this.#fullText,
      charCount: this.#fullText.length,
      duration: performance.now() - this.#startTime,
      cancelled: false,
      error: true
    });

    this.#callbackSafe('onError', error);

    this.#logger.error('Stream error:', error);
  }

  #removeCursor() {
    this.#target.classList.remove('vox-chronicle-stream--active');
  }

  #isScrolledToBottom() {
    const threshold = 10;
    return (
      this.#target.scrollHeight - this.#target.scrollTop - this.#target.clientHeight < threshold
    );
  }

  #emitSafe(event, payload) {
    try {
      this.#eventBus?.emit(event, payload);
    } catch (error) {
      this.#logger.warn(`EventBus emit "${event}" failed:`, error);
    }
  }

  #callbackSafe(name, ...args) {
    try {
      this.#options[name]?.(...args);
    } catch (error) {
      this.#logger.warn(`Callback "${name}" threw:`, error);
    }
  }

  #removeExternalAbortListener() {
    if (this.#externalAbortSignal && this.#externalAbortHandler) {
      this.#externalAbortSignal.removeEventListener('abort', this.#externalAbortHandler);
      this.#externalAbortSignal = null;
      this.#externalAbortHandler = null;
    }
  }
}
