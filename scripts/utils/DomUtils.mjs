/**
 * DOM Utilities - Debouncing and DOM manipulation helpers
 * Provides utilities for efficient DOM updates and event handling
 * @module DomUtils
 */

/**
 * Creates a debounced version of a function that delays its execution
 * until after a specified delay has elapsed since the last invocation.
 *
 * Useful for rate-limiting expensive operations like rendering, API calls,
 * or event handlers that fire rapidly (resize, scroll, input events).
 *
 * The debounced function can be cancelled to prevent pending execution.
 *
 * @example
 * // Debounce a render function with 150ms delay
 * const debouncedRender = debounce(() => {
 *   this.render(false);
 * }, 150);
 *
 * // Call multiple times - only executes once after 150ms of silence
 * debouncedRender();
 * debouncedRender();
 * debouncedRender();
 *
 * // Cancel pending execution
 * debouncedRender.cancel();
 *
 * @param {Function} func - The function to debounce
 * @param {number} delay - The delay in milliseconds to wait before executing
 * @returns {Function} A debounced version of the function with a cancel() method
 */
export function debounce(func, delay) {
    let timeoutId = null;

    /**
     * The debounced function that delays execution
     * @param {...*} args - Arguments to pass to the original function
     */
    const debounced = function(...args) {
        // Clear any pending execution
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }

        // Schedule new execution
        timeoutId = setTimeout(() => {
            timeoutId = null;
            func.apply(this, args);
        }, delay);
    };

    /**
     * Cancels any pending execution of the debounced function
     * Use this to prevent a scheduled function call from executing
     */
    debounced.cancel = function() {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    return debounced;
}

