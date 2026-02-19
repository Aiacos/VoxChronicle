import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger, LogLevel } from '../../scripts/utils/Logger.mjs';

describe('Logger', () => {
  beforeEach(() => {
    // Reset Logger static state before each test
    Logger._logLevel = LogLevel.LOG;
    Logger._debugEnabled = false;
    Logger._timers = new Map();

    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'group').mockImplementation(() => {});
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    vi.spyOn(console, 'table').mockImplementation(() => {});
    vi.spyOn(console, 'dir').mockImplementation(() => {});
    vi.spyOn(console, 'trace').mockImplementation(() => {});
    vi.spyOn(console, 'assert').mockImplementation(() => {});
    vi.spyOn(console, 'clear').mockImplementation(() => {});
  });

  // ── LogLevel enum ──────────────────────────────────────────────────────

  describe('LogLevel', () => {
    it('should define expected numeric levels in ascending order', () => {
      expect(LogLevel.DEBUG).toBe(0);
      expect(LogLevel.INFO).toBe(1);
      expect(LogLevel.LOG).toBe(2);
      expect(LogLevel.WARN).toBe(3);
      expect(LogLevel.ERROR).toBe(4);
      expect(LogLevel.NONE).toBe(5);
    });
  });

  // ── setLogLevel / setDebugEnabled / setDebugMode / isDebugMode ─────────

  describe('setLogLevel()', () => {
    it('should set the log level to a valid value', () => {
      Logger.setLogLevel(LogLevel.DEBUG);
      expect(Logger._logLevel).toBe(LogLevel.DEBUG);
    });

    it('should accept all valid log levels', () => {
      for (const level of Object.values(LogLevel)) {
        Logger.setLogLevel(level);
        expect(Logger._logLevel).toBe(level);
      }
    });

    it('should ignore values below DEBUG', () => {
      Logger.setLogLevel(LogLevel.WARN);
      Logger.setLogLevel(-1);
      expect(Logger._logLevel).toBe(LogLevel.WARN);
    });

    it('should ignore values above NONE', () => {
      Logger.setLogLevel(LogLevel.WARN);
      Logger.setLogLevel(99);
      expect(Logger._logLevel).toBe(LogLevel.WARN);
    });
  });

  describe('setDebugEnabled()', () => {
    it('should enable debug mode and set log level to DEBUG', () => {
      Logger.setDebugEnabled(true);
      expect(Logger._debugEnabled).toBe(true);
      expect(Logger._logLevel).toBe(LogLevel.DEBUG);
    });

    it('should disable debug mode without changing log level', () => {
      Logger.setDebugEnabled(true);
      Logger.setDebugEnabled(false);
      expect(Logger._debugEnabled).toBe(false);
      // Log level was set to DEBUG when enabled; disabling does not reset it
      expect(Logger._logLevel).toBe(LogLevel.DEBUG);
    });

    it('should coerce truthy values to boolean', () => {
      Logger.setDebugEnabled(1);
      expect(Logger._debugEnabled).toBe(true);
      Logger.setDebugEnabled(0);
      expect(Logger._debugEnabled).toBe(false);
    });
  });

  describe('setDebugMode()', () => {
    it('should be an alias for setDebugEnabled', () => {
      Logger.setDebugMode(true);
      expect(Logger._debugEnabled).toBe(true);
      expect(Logger._logLevel).toBe(LogLevel.DEBUG);
    });
  });

  describe('isDebugMode()', () => {
    it('should return false by default', () => {
      expect(Logger.isDebugMode()).toBe(false);
    });

    it('should return true when debug is enabled', () => {
      Logger.setDebugEnabled(true);
      expect(Logger.isDebugMode()).toBe(true);
    });
  });

  // ── Internal helpers ────────────────────────────────────────────────────

  describe('_getPrefix()', () => {
    it('should return module-prefixed string', () => {
      const prefix = Logger._getPrefix();
      expect(prefix).toBe('vox-chronicle |');
    });
  });

  describe('_getStyledPrefix()', () => {
    it('should return an array with styled prefix arguments', () => {
      const result = Logger._getStyledPrefix('INFO', '#3498db');
      expect(result).toHaveLength(3);
      expect(result[0]).toContain('vox-chronicle');
      expect(result[0]).toContain('INFO');
      expect(result[2]).toContain('#3498db');
    });
  });

  // ── Logging methods ────────────────────────────────────────────────────

  describe('debug()', () => {
    it('should not log when debug is disabled', () => {
      Logger.setLogLevel(LogLevel.DEBUG);
      Logger.debug('test');
      expect(console.debug).not.toHaveBeenCalled();
    });

    it('should not log when log level is above DEBUG even if debug enabled', () => {
      Logger._debugEnabled = true;
      Logger._logLevel = LogLevel.INFO;
      Logger.debug('test');
      expect(console.debug).not.toHaveBeenCalled();
    });

    it('should log when both debug enabled and level permits', () => {
      Logger.setDebugEnabled(true);
      Logger.debug('hello', 'world');
      expect(console.debug).toHaveBeenCalledWith(
        expect.stringContaining('vox-chronicle'),
        'hello',
        'world'
      );
    });

    it('should include [DEBUG] tag in output', () => {
      Logger.setDebugEnabled(true);
      Logger.debug('msg');
      expect(console.debug).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]'),
        'msg'
      );
    });
  });

  describe('info()', () => {
    it('should not log when log level is above INFO', () => {
      Logger.setLogLevel(LogLevel.WARN);
      Logger.info('test');
      expect(console.info).not.toHaveBeenCalled();
    });

    it('should log when log level is INFO', () => {
      Logger.setLogLevel(LogLevel.INFO);
      Logger.info('test info');
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        'test info'
      );
    });

    it('should log when log level is DEBUG', () => {
      Logger.setLogLevel(LogLevel.DEBUG);
      Logger.info('visible');
      expect(console.info).toHaveBeenCalled();
    });
  });

  describe('log()', () => {
    it('should log at LOG level by default', () => {
      Logger.log('default message');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('vox-chronicle'),
        'default message'
      );
    });

    it('should not log when level is above LOG', () => {
      Logger.setLogLevel(LogLevel.WARN);
      Logger.log('suppressed');
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should pass multiple arguments', () => {
      Logger.log('a', 'b', 123);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('vox-chronicle'),
        'a',
        'b',
        123
      );
    });
  });

  describe('warn()', () => {
    it('should log warnings at default level', () => {
      Logger.warn('warning msg');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]'),
        'warning msg'
      );
    });

    it('should not log when level is ERROR', () => {
      Logger.setLogLevel(LogLevel.ERROR);
      Logger.warn('suppressed');
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should not log when level is NONE', () => {
      Logger.setLogLevel(LogLevel.NONE);
      Logger.warn('hidden');
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('error()', () => {
    it('should log errors at default level', () => {
      Logger.error('error msg');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        'error msg'
      );
    });

    it('should log errors at WARN level', () => {
      Logger.setLogLevel(LogLevel.WARN);
      Logger.error('still visible');
      expect(console.error).toHaveBeenCalled();
    });

    it('should not log when level is NONE', () => {
      Logger.setLogLevel(LogLevel.NONE);
      Logger.error('hidden');
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  // ── group / groupEnd ───────────────────────────────────────────────────

  describe('group()', () => {
    it('should start a collapsed group by default', () => {
      Logger.group('My Group');
      expect(console.groupCollapsed).toHaveBeenCalledWith(
        expect.stringContaining('My Group')
      );
      expect(console.group).not.toHaveBeenCalled();
    });

    it('should start an expanded group when collapsed=false', () => {
      Logger.group('Expanded Group', false);
      expect(console.group).toHaveBeenCalledWith(
        expect.stringContaining('Expanded Group')
      );
      expect(console.groupCollapsed).not.toHaveBeenCalled();
    });

    it('should include the module prefix', () => {
      Logger.group('test');
      expect(console.groupCollapsed).toHaveBeenCalledWith(
        expect.stringContaining('vox-chronicle')
      );
    });
  });

  describe('groupEnd()', () => {
    it('should call console.groupEnd', () => {
      Logger.groupEnd();
      expect(console.groupEnd).toHaveBeenCalled();
    });
  });

  // ── time / timeEnd ─────────────────────────────────────────────────────

  describe('time()', () => {
    it('should store a timer entry', () => {
      Logger.setDebugEnabled(true);
      Logger.time('myTimer');
      expect(Logger._timers.has('myTimer')).toBe(true);
    });

    it('should store a numeric timestamp', () => {
      Logger.time('t');
      expect(typeof Logger._timers.get('t')).toBe('number');
    });
  });

  describe('timeEnd()', () => {
    it('should return elapsed time for a known timer', () => {
      Logger.time('elapsed');
      const result = Logger.timeEnd('elapsed');
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('should remove the timer after ending', () => {
      Logger.time('gone');
      Logger.timeEnd('gone');
      expect(Logger._timers.has('gone')).toBe(false);
    });

    it('should return null and warn for unknown timer', () => {
      const result = Logger.timeEnd('nonexistent');
      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]'),
        expect.stringContaining('nonexistent')
      );
    });

    it('should log elapsed time via Logger.log', () => {
      Logger.time('logged');
      Logger.timeEnd('logged');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('vox-chronicle'),
        expect.stringContaining('logged:')
      );
    });
  });

  // ── table / dir / trace / assert / clear ───────────────────────────────

  describe('table()', () => {
    it('should not log when level is above DEBUG', () => {
      Logger.setLogLevel(LogLevel.LOG);
      Logger.table([1, 2, 3]);
      expect(console.table).not.toHaveBeenCalled();
    });

    it('should log table data when level is DEBUG', () => {
      Logger.setLogLevel(LogLevel.DEBUG);
      const data = [{ a: 1 }, { a: 2 }];
      Logger.table(data);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Table:'));
      expect(console.table).toHaveBeenCalledWith(data, undefined);
    });

    it('should pass optional columns parameter', () => {
      Logger.setLogLevel(LogLevel.DEBUG);
      const data = [{ a: 1, b: 2 }];
      Logger.table(data, ['a']);
      expect(console.table).toHaveBeenCalledWith(data, ['a']);
    });
  });

  describe('dir()', () => {
    it('should not log when level is above DEBUG', () => {
      Logger.setLogLevel(LogLevel.LOG);
      Logger.dir('label', { x: 1 });
      expect(console.dir).not.toHaveBeenCalled();
    });

    it('should log label and object when level is DEBUG', () => {
      Logger.setLogLevel(LogLevel.DEBUG);
      const obj = { test: true };
      Logger.dir('MyObj', obj);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('MyObj:'));
      expect(console.dir).toHaveBeenCalledWith(obj);
    });
  });

  describe('trace()', () => {
    it('should not log when level is above DEBUG', () => {
      Logger.setLogLevel(LogLevel.LOG);
      Logger.trace('nope');
      expect(console.trace).not.toHaveBeenCalled();
    });

    it('should call console.trace with prefix when level is DEBUG', () => {
      Logger.setLogLevel(LogLevel.DEBUG);
      Logger.trace('tracing', 42);
      expect(console.trace).toHaveBeenCalledWith(
        expect.stringContaining('[TRACE]'),
        'tracing',
        42
      );
    });
  });

  describe('assert()', () => {
    it('should always call console.assert with prefix', () => {
      Logger.assert(true, 'should pass');
      expect(console.assert).toHaveBeenCalledWith(
        true,
        expect.stringContaining('[ASSERT]'),
        'should pass'
      );
    });

    it('should pass false condition to console.assert', () => {
      Logger.assert(false, 'failure');
      expect(console.assert).toHaveBeenCalledWith(
        false,
        expect.stringContaining('[ASSERT]'),
        'failure'
      );
    });
  });

  describe('clear()', () => {
    it('should call console.clear and then log a message', () => {
      Logger.clear();
      expect(console.clear).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('vox-chronicle'),
        'Console cleared'
      );
    });
  });

  // ── createChild ────────────────────────────────────────────────────────

  describe('createChild()', () => {
    it('should return an object with all expected methods', () => {
      const child = Logger.createChild('TestModule');
      expect(typeof child.debug).toBe('function');
      expect(typeof child.info).toBe('function');
      expect(typeof child.log).toBe('function');
      expect(typeof child.warn).toBe('function');
      expect(typeof child.error).toBe('function');
      expect(typeof child.group).toBe('function');
      expect(typeof child.groupEnd).toBe('function');
      expect(typeof child.time).toBe('function');
      expect(typeof child.timeEnd).toBe('function');
    });

    it('should prefix messages with the sub-module name', () => {
      const child = Logger.createChild('SubMod');
      child.log('hello');
      expect(console.log).toHaveBeenCalledWith(
        'vox-chronicle:SubMod |',
        'hello'
      );
    });

    it('should respect log level for child debug()', () => {
      const child = Logger.createChild('Sub');
      Logger.setDebugEnabled(true);
      child.debug('visible');
      expect(console.debug).toHaveBeenCalledWith(
        expect.stringContaining('vox-chronicle:Sub'),
        'visible'
      );
    });

    it('should suppress child debug() when debug disabled', () => {
      const child = Logger.createChild('Sub');
      Logger.setLogLevel(LogLevel.DEBUG);
      // Debug enabled is false
      child.debug('hidden');
      expect(console.debug).not.toHaveBeenCalled();
    });

    it('should respect log level for child info()', () => {
      const child = Logger.createChild('Sub');
      Logger.setLogLevel(LogLevel.WARN);
      child.info('hidden');
      expect(console.info).not.toHaveBeenCalled();
    });

    it('should respect log level for child warn()', () => {
      const child = Logger.createChild('Sub');
      Logger.setLogLevel(LogLevel.ERROR);
      child.warn('hidden');
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should log via child warn() when level permits', () => {
      const child = Logger.createChild('Sub');
      Logger.setLogLevel(LogLevel.WARN);
      child.warn('visible warning');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('vox-chronicle:Sub'),
        'visible warning'
      );
    });

    it('should respect log level for child error()', () => {
      const child = Logger.createChild('Sub');
      Logger.setLogLevel(LogLevel.NONE);
      child.error('hidden');
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should log via child error() when level permits', () => {
      const child = Logger.createChild('Sub');
      Logger.setLogLevel(LogLevel.ERROR);
      child.error('visible error');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('vox-chronicle:Sub'),
        'visible error'
      );
    });

    it('should log via child info() when level permits', () => {
      const child = Logger.createChild('Sub');
      Logger.setLogLevel(LogLevel.INFO);
      child.info('visible info');
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('vox-chronicle:Sub'),
        'visible info'
      );
    });

    it('should delegate child time/timeEnd to Logger with prefixed label', () => {
      const child = Logger.createChild('MyService');
      child.time('op');
      expect(Logger._timers.has('MyService:op')).toBe(true);

      const elapsed = child.timeEnd('op');
      expect(typeof elapsed).toBe('number');
      expect(Logger._timers.has('MyService:op')).toBe(false);
    });

    it('should delegate child groupEnd to console.groupEnd', () => {
      const child = Logger.createChild('Sub');
      child.groupEnd();
      expect(console.groupEnd).toHaveBeenCalled();
    });

    it('should use collapsed group by default in child', () => {
      const child = Logger.createChild('Sub');
      child.group('G');
      expect(console.groupCollapsed).toHaveBeenCalledWith(
        expect.stringContaining('vox-chronicle:Sub')
      );
    });

    it('should use expanded group when collapsed=false in child', () => {
      const child = Logger.createChild('Sub');
      child.group('G', false);
      expect(console.group).toHaveBeenCalledWith(
        expect.stringContaining('vox-chronicle:Sub')
      );
    });

    // Sanitization option
    describe('with sanitization enabled', () => {
      it('should accept boolean true for sanitization', () => {
        const child = Logger.createChild('Secure', true);
        child.log('key is sk-proj-abcdefghijk1234567890');
        expect(console.log).toHaveBeenCalled();
        const loggedArgs = console.log.mock.calls[0];
        // The sensitive key should be redacted
        expect(loggedArgs.join(' ')).not.toContain('sk-proj-abcdefghijk1234567890');
      });

      it('should accept object with sanitize property', () => {
        const child = Logger.createChild('Secure', { sanitize: true });
        child.log('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
        const loggedArgs = console.log.mock.calls[0];
        expect(loggedArgs.join(' ')).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      });

      it('should sanitize group labels when sanitize is true', () => {
        const child = Logger.createChild('Sec', true);
        child.group('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
        const label = console.groupCollapsed.mock.calls[0][0];
        expect(label).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      });

      it('should not sanitize when option is false', () => {
        const child = Logger.createChild('Open', false);
        child.log('sk-proj-abcdefghijk1234567890');
        const loggedArgs = console.log.mock.calls[0];
        expect(loggedArgs[1]).toBe('sk-proj-abcdefghijk1234567890');
      });

      it('should not sanitize when object option has no sanitize property', () => {
        const child = Logger.createChild('Open', {});
        child.log('sk-proj-abcdefghijk1234567890');
        const loggedArgs = console.log.mock.calls[0];
        expect(loggedArgs[1]).toBe('sk-proj-abcdefghijk1234567890');
      });

      it('should not sanitize when object option has sanitize: false', () => {
        const child = Logger.createChild('Open', { sanitize: false });
        child.log('sk-proj-abcdefghijk1234567890');
        const loggedArgs = console.log.mock.calls[0];
        expect(loggedArgs[1]).toBe('sk-proj-abcdefghijk1234567890');
      });
    });
  });
});
