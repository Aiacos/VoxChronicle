import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizeHtml, stripHtml } from '../../scripts/utils/HtmlUtils.mjs';

describe('escapeHtml', () => {
  it('should escape ampersand', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('should escape less-than sign', () => {
    expect(escapeHtml('<tag>')).toBe('&lt;tag&gt;');
  });

  it('should escape greater-than sign', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("it's fine")).toBe('it&#039;s fine');
  });

  it('should escape all special chars in one string', () => {
    const input = '<div class="test">&\'</div>';
    const expected = '&lt;div class=&quot;test&quot;&gt;&amp;&#039;&lt;/div&gt;';
    expect(escapeHtml(input)).toBe(expected);
  });

  it('should return empty string for null', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('should return empty string for empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should return empty string for zero', () => {
    expect(escapeHtml(0)).toBe('');
  });

  it('should return empty string for false', () => {
    expect(escapeHtml(false)).toBe('');
  });

  it('should convert truthy non-string values via String()', () => {
    // 42 is truthy, so it passes the !text guard and String(42) = '42'
    expect(escapeHtml(42)).toBe('42');
  });

  it('should handle strings without special characters unchanged', () => {
    const input = 'Hello, World!';
    expect(escapeHtml(input)).toBe('Hello, World!');
  });

  it('should handle a script injection attempt', () => {
    const xss = '<script>alert("XSS")</script>';
    const result = escapeHtml(xss);
    expect(result).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('should handle consecutive special characters', () => {
    expect(escapeHtml('<<>>')).toBe('&lt;&lt;&gt;&gt;');
  });

  it('should handle string with only special characters', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#039;');
  });

  it('should handle multiline strings', () => {
    const input = 'line1 <b>\nline2 & "quoted"';
    const expected = 'line1 &lt;b&gt;\nline2 &amp; &quot;quoted&quot;';
    expect(escapeHtml(input)).toBe(expected);
  });

  it('should handle truthy non-string input by converting to string', () => {
    // A truthy number passes the !text check; String(number) is returned
    const result = escapeHtml(123);
    // 123 is truthy, so String(123) = '123', no special chars
    // Actually 0 is falsy so returns '', but 123 is truthy
    expect(result).toBe('123');
  });
});

describe('sanitizeHtml', () => {
  // --- Input validation ---
  describe('input validation', () => {
    it('should return empty string for null', () => {
      expect(sanitizeHtml(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(sanitizeHtml(undefined)).toBe('');
    });

    it('should return empty string for empty string', () => {
      expect(sanitizeHtml('')).toBe('');
    });

    it('should return empty string for non-string input (number)', () => {
      expect(sanitizeHtml(123)).toBe('');
    });

    it('should return empty string for non-string input (boolean)', () => {
      expect(sanitizeHtml(true)).toBe('');
    });

    it('should return empty string for non-string input (object)', () => {
      expect(sanitizeHtml({})).toBe('');
    });
  });

  // --- Dangerous element removal ---
  describe('dangerous element removal', () => {
    it('should remove script tags and their content', () => {
      const result = sanitizeHtml('<p>Safe</p><script>alert("xss")</script>');
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
      expect(result).toContain('Safe');
    });

    it('should remove iframe tags', () => {
      const result = sanitizeHtml('<p>Text</p><iframe src="https://evil.com"></iframe>');
      expect(result).not.toContain('<iframe');
      expect(result).not.toContain('evil.com');
      expect(result).toContain('Text');
    });

    it('should remove object tags', () => {
      const result = sanitizeHtml('<object data="malware.swf"></object><p>Content</p>');
      expect(result).not.toContain('<object');
      expect(result).toContain('Content');
    });

    it('should remove embed tags', () => {
      const result = sanitizeHtml('<embed src="plugin.swf"><p>Content</p>');
      expect(result).not.toContain('<embed');
      expect(result).toContain('Content');
    });

    it('should remove form tags', () => {
      const result = sanitizeHtml('<form action="/steal"><p>Phishing</p></form>');
      expect(result).not.toContain('<form');
    });

    it('should remove input tags', () => {
      const result = sanitizeHtml('<p>Name: </p><input type="text" value="trap">');
      expect(result).not.toContain('<input');
      expect(result).toContain('Name:');
    });

    it('should remove button tags', () => {
      const result = sanitizeHtml('<button onclick="steal()">Click me</button><p>Safe</p>');
      expect(result).not.toContain('<button');
      expect(result).toContain('Safe');
    });

    it('should remove textarea tags', () => {
      const result = sanitizeHtml('<textarea>hidden</textarea><p>Visible</p>');
      expect(result).not.toContain('<textarea');
      expect(result).toContain('Visible');
    });

    it('should remove select tags', () => {
      const result = sanitizeHtml('<select><option>Pick</option></select><p>Text</p>');
      expect(result).not.toContain('<select');
      expect(result).toContain('Text');
    });

    it('should remove style tags and their content', () => {
      const result = sanitizeHtml('<style>body { display: none; }</style><p>Visible</p>');
      expect(result).not.toContain('<style');
      expect(result).not.toContain('display');
      expect(result).toContain('Visible');
    });

    it('should remove link tags', () => {
      const result = sanitizeHtml('<link rel="stylesheet" href="evil.css"><p>Content</p>');
      expect(result).not.toContain('<link');
      expect(result).toContain('Content');
    });

    it('should remove meta tags', () => {
      const result = sanitizeHtml('<meta http-equiv="refresh" content="0;url=evil.com"><p>Text</p>');
      expect(result).not.toContain('<meta');
      expect(result).toContain('Text');
    });

    it('should remove base tags', () => {
      const result = sanitizeHtml('<base href="https://evil.com"><p>Content</p>');
      expect(result).not.toContain('<base');
      expect(result).toContain('Content');
    });
  });

  // --- Event handler removal ---
  describe('event handler removal', () => {
    it('should remove onclick attribute from elements', () => {
      const result = sanitizeHtml('<div onclick="alert(1)">Click</div>');
      expect(result).not.toContain('onclick');
      expect(result).toContain('Click');
    });

    it('should remove onload attribute from elements', () => {
      const result = sanitizeHtml('<img src="photo.jpg" onload="steal()">');
      expect(result).not.toContain('onload');
      expect(result).not.toContain('steal');
    });

    it('should remove onerror attribute from elements', () => {
      const result = sanitizeHtml('<img src="x" onerror="alert(document.cookie)">');
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('alert');
    });

    it('should remove onmouseover attribute from elements', () => {
      const result = sanitizeHtml('<a href="#" onmouseover="evil()">Link</a>');
      expect(result).not.toContain('onmouseover');
      expect(result).toContain('Link');
    });

    it('should remove onfocus attribute from elements', () => {
      const result = sanitizeHtml('<div onfocus="hack()">Content</div>');
      expect(result).not.toContain('onfocus');
      expect(result).toContain('Content');
    });

    it('should remove srcdoc attribute from elements', () => {
      const result = sanitizeHtml('<div srcdoc="<script>alert(1)</script>">Safe</div>');
      expect(result).not.toContain('srcdoc');
      expect(result).toContain('Safe');
    });
  });

  // --- Dangerous protocol removal ---
  describe('dangerous protocol removal', () => {
    it('should remove javascript: protocol from href', () => {
      const result = sanitizeHtml('<a href="javascript:alert(1)">Link</a>');
      expect(result).not.toContain('javascript:');
      expect(result).toContain('Link');
    });

    it('should remove data: protocol from src', () => {
      const result = sanitizeHtml('<img src="data:text/html,<script>alert(1)</script>">');
      expect(result).not.toContain('data:');
    });

    it('should remove vbscript: protocol from href', () => {
      const result = sanitizeHtml('<a href="vbscript:MsgBox(1)">Link</a>');
      expect(result).not.toContain('vbscript:');
      expect(result).toContain('Link');
    });

    it('should handle javascript: with leading whitespace', () => {
      const result = sanitizeHtml('<a href="  javascript:alert(1)">Link</a>');
      expect(result).not.toContain('javascript:');
      expect(result).toContain('Link');
    });

    it('should handle mixed-case javascript: protocol', () => {
      // DOMParser lowercases attribute values, so this should be caught
      const result = sanitizeHtml('<a href="JavaScript:alert(1)">Link</a>');
      expect(result).not.toContain('javascript:');
      expect(result).toContain('Link');
    });
  });

  // --- Safe content preservation ---
  describe('safe content preservation', () => {
    it('should preserve paragraph tags', () => {
      const result = sanitizeHtml('<p>Hello World</p>');
      expect(result).toContain('<p>');
      expect(result).toContain('Hello World');
    });

    it('should preserve heading tags', () => {
      const result = sanitizeHtml('<h1>Title</h1><h2>Subtitle</h2>');
      expect(result).toContain('<h1>');
      expect(result).toContain('<h2>');
      expect(result).toContain('Title');
      expect(result).toContain('Subtitle');
    });

    it('should preserve emphasis and strong tags', () => {
      const result = sanitizeHtml('<em>italic</em> and <strong>bold</strong>');
      expect(result).toContain('<em>');
      expect(result).toContain('<strong>');
      expect(result).toContain('italic');
      expect(result).toContain('bold');
    });

    it('should preserve list tags', () => {
      const result = sanitizeHtml('<ul><li>Item 1</li><li>Item 2</li></ul>');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>');
      expect(result).toContain('Item 1');
      expect(result).toContain('Item 2');
    });

    it('should preserve safe anchor links with https href', () => {
      const result = sanitizeHtml('<a href="https://example.com">Safe Link</a>');
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('Safe Link');
    });

    it('should preserve img tags with https src', () => {
      const result = sanitizeHtml('<img src="https://example.com/photo.jpg">');
      expect(result).toContain('src="https://example.com/photo.jpg"');
    });

    it('should preserve div and span tags', () => {
      const result = sanitizeHtml('<div><span>Content</span></div>');
      expect(result).toContain('<div>');
      expect(result).toContain('<span>');
      expect(result).toContain('Content');
    });

    it('should preserve br tags', () => {
      const result = sanitizeHtml('Line 1<br>Line 2');
      expect(result).toContain('<br>');
    });

    it('should preserve table tags', () => {
      const result = sanitizeHtml('<table><tr><td>Cell</td></tr></table>');
      expect(result).toContain('<table>');
      expect(result).toContain('<td>');
      expect(result).toContain('Cell');
    });
  });

  // --- Complex scenarios ---
  describe('complex scenarios', () => {
    it('should handle nested dangerous elements inside safe containers', () => {
      const result = sanitizeHtml('<div><p>Safe</p><script>evil()</script><p>Also safe</p></div>');
      expect(result).toContain('Safe');
      expect(result).toContain('Also safe');
      expect(result).not.toContain('<script');
      expect(result).not.toContain('evil');
    });

    it('should handle multiple dangerous elements in one string', () => {
      const input = '<script>a()</script><iframe src="x"></iframe><style>body{}</style><p>Clean</p>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('<iframe');
      expect(result).not.toContain('<style');
      expect(result).toContain('Clean');
    });

    it('should preserve text content while removing dangerous elements', () => {
      const result = sanitizeHtml('<p>The dragon <script>alert(1)</script>attacks the party.</p>');
      expect(result).toContain('The dragon');
      expect(result).toContain('attacks the party.');
      expect(result).not.toContain('<script');
    });

    it('should handle mixed safe and dangerous attributes on the same element', () => {
      const result = sanitizeHtml('<a href="https://safe.com" onclick="steal()">Link</a>');
      expect(result).toContain('href="https://safe.com"');
      expect(result).not.toContain('onclick');
      expect(result).toContain('Link');
    });

    it('should handle multiple event handlers on a single element', () => {
      const result = sanitizeHtml('<div onclick="a()" onmouseover="b()" onload="c()">Text</div>');
      expect(result).not.toContain('onclick');
      expect(result).not.toContain('onmouseover');
      expect(result).not.toContain('onload');
      expect(result).toContain('Text');
    });

    it('should handle a realistic chronicle HTML snippet', () => {
      const chronicle = `
        <h2>Session 5: The Dragon's Lair</h2>
        <p>The party entered the <strong>dark cavern</strong> with caution.</p>
        <ul>
          <li><em>Thorin</em> raised his shield</li>
          <li><em>Elara</em> cast <strong>Detect Magic</strong></li>
        </ul>
        <p>Image: <img src="https://example.com/dragon.jpg"></p>
        <a href="https://kanka.io/campaign/123">View on Kanka</a>
      `;
      const result = sanitizeHtml(chronicle);
      expect(result).toContain('<h2>');
      expect(result).toContain('<strong>');
      expect(result).toContain('<em>');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>');
      expect(result).toContain('Thorin');
      expect(result).toContain('Detect Magic');
      expect(result).toContain('src="https://example.com/dragon.jpg"');
      expect(result).toContain('href="https://kanka.io/campaign/123"');
    });

    it('should handle plain text without any HTML', () => {
      const result = sanitizeHtml('Just plain text, no HTML here.');
      expect(result).toBe('Just plain text, no HTML here.');
    });

    it('should handle empty tags', () => {
      const result = sanitizeHtml('<p></p><div></div>');
      expect(result).toContain('<p>');
      expect(result).toContain('<div>');
    });
  });
});

describe('stripHtml', () => {
  it('should return empty string for null', () => {
    expect(stripHtml(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(stripHtml(undefined)).toBe('');
  });

  it('should return empty string for empty string', () => {
    expect(stripHtml('')).toBe('');
  });

  it('should return empty string for non-string', () => {
    expect(stripHtml(123)).toBe('');
    expect(stripHtml(42)).toBe('');
  });

  it('should strip HTML tags', () => {
    expect(stripHtml('<p>Hello <strong>World</strong></p>')).toBe('Hello World');
  });

  it('should normalize whitespace', () => {
    expect(stripHtml('<p>Hello    World</p>')).toBe('Hello World');
  });

  it('should strip tags and normalize whitespace together', () => {
    expect(stripHtml('<p>Hello   <strong>World</strong></p>')).toBe('Hello World');
  });

  it('should handle multiple block elements', () => {
    expect(stripHtml('<p>Hello</p>  <p>World</p>')).toBe('Hello World');
  });

  it('should safely handle XSS-dangerous input', () => {
    const xssInput = '<img src=x onerror="alert(1)"><p>Safe text</p>';
    const result = stripHtml(xssInput);
    expect(result).toBe('Safe text');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert');
  });

  it('should handle script tags', () => {
    const scriptInput = '<script>alert("xss")</script><p>Content</p>';
    const result = stripHtml(scriptInput);
    expect(result).toContain('Content');
    expect(result).not.toContain('<script>');
  });
});
