/**
 * HtmlUtils - HTML Sanitization Utilities for VoxChronicle
 *
 * Provides HTML escaping and sanitization functions to prevent XSS vulnerabilities
 * when rendering user-controlled data in UI components.
 *
 * @module vox-chronicle
 */

/**
 * Escape HTML special characters to prevent XSS attacks
 *
 * Converts potentially dangerous HTML characters into their safe entity equivalents.
 * This prevents user-controlled data from being interpreted as HTML when rendered.
 *
 * @param {string} text - The text to escape
 * @returns {string} HTML-safe text with special characters escaped
 *
 * @example
 * escapeHtml('<script>alert("XSS")</script>')
 * // Returns: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
 *
 * @example
 * escapeHtml('User & Co.')
 * // Returns: 'User &amp; Co.'
 */
export function escapeHtml(text) {
  if (!text) {
    return '';
  }

  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };

  return String(text).replace(/[&<>"']/g, (char) => escapeMap[char]);
}

/**
 * Strips HTML tags from content while preserving text.
 * Uses DOMParser for safe parsing without script execution (XSS prevention).
 *
 * @param {string} html - The HTML content to strip
 * @returns {string} Plain text content with normalized whitespace
 */
export function stripHtml(html) {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Use DOMParser to safely parse HTML without executing scripts
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Get text content from the parsed document body
  let text = doc.body.textContent || '';

  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}
