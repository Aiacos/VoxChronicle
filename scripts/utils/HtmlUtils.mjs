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
 * Sanitize HTML by removing dangerous elements (script, iframe, event handlers)
 * while preserving safe formatting tags used in chronicle drafts.
 *
 * @param {string} html - The HTML content to sanitize
 * @returns {string} Sanitized HTML with dangerous elements removed
 */
export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') {
    return '';
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove dangerous elements
  const dangerous = doc.querySelectorAll('script, iframe, object, embed, form, input, textarea, select, button, style, link, meta, base');
  for (const el of dangerous) {
    el.remove();
  }

  // Remove event handler attributes from all elements
  const allElements = doc.body.querySelectorAll('*');
  for (const el of allElements) {
    const attrs = [...el.attributes];
    for (const attr of attrs) {
      if (attr.name.startsWith('on') || attr.name === 'srcdoc') {
        el.removeAttribute(attr.name);
      }
      // Remove dangerous protocol URLs (javascript:, data:, vbscript:)
      if (['href', 'src', 'action'].includes(attr.name)) {
        const val = attr.value.trim().toLowerCase();
        if (val.startsWith('javascript:') || val.startsWith('data:') || val.startsWith('vbscript:')) {
          el.removeAttribute(attr.name);
        }
      }
    }
  }

  return doc.body.innerHTML;
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
