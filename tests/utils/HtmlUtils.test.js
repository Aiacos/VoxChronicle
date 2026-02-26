import { describe, it, expect } from 'vitest';
import { escapeHtml, stripHtml } from '../../scripts/utils/HtmlUtils.mjs';

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
