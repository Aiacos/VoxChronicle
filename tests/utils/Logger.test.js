/**
 * Logger Unit Tests
 *
 * Tests for the Logger utility class.
 * Covers log levels, console output, timers, and child logger creation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock MODULE_ID before importing Logger to avoid circular dependencies
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Mock SensitiveDataFilter to avoid additional dependencies
vi.mock('../../scripts/utils/SensitiveDataFilter.mjs', () => ({
  SensitiveDataFilter: {
    sanitizeArgs: vi.fn((args) => args),
    sanitizeString: vi.fn((str) => str)
  }
}));

import { Logger, LogLevel } from '../../scripts/utils/Logger.mjs';

describe('Logger', () => {
  // Store original console methods
  let originalConsole;

  beforeEach(() => {
    // Save original console
    originalConsole = {
      debug: console.debug,
      info: console.info,
      log: console.log,
      warn: console.warn,
      error: console.error,
      group: console.group,
      groupCollapsed: console.groupCollapsed,
      groupEnd: console.groupEnd,
      table: console.table,
      dir: console.dir,
      trace: console.trace,
      assert: console.assert,
      clear: console.clear
    };

    // Mock all console methods
    console.debug = vi.fn();
    console.info = vi.fn();
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
    console.group = vi.fn();
    console.groupCollapsed = vi.fn();
    console.groupEnd = vi.fn();
    console.table = vi.fn();
    console.dir = vi.fn();
    console.trace = vi.fn();
    console.assert = vi.fn();
    console.clear = vi.fn();

    // Reset Logger state to defaults
    Logger._logLevel = LogLevel.LOG;
    Logger._debugEnabled = false;
    Logger._timers.clear();
  });

  afterEach(() => {
    // Restore original console
    console.debug = originalConsole.debug;
    console.info = originalConsole.info;
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.group = originalConsole.group;
    console.groupCollapsed = originalConsole.groupCollapsed;
    console.groupEnd = originalConsole.groupEnd;
    console.table = originalConsole.table;
    console.dir = originalConsole.dir;
    console.trace = originalConsole.trace;
    console.assert = originalConsole.assert;
    console.clear = originalConsole.clear;
  });

  describe('LogLevel', () => {
    it('should export LogLevel enum with correct values', () => {
      expect(LogLevel.DEBUG).toBe(0);
      expect(LogLevel.INFO).toBe(1);
      expect(LogLevel.LOG).toBe(2);
      expect(LogLevel.WARN).toBe(3);
      expect(LogLevel.ERROR).toBe(4);
      expect(LogLevel.NONE).toBe(5);
    });
  });

  describe('setLogLevel', () => {
    it('should set log level to DEBUG', () => {
      Logger.setLogLevel(LogLevel.DEBUG);
      expect(Logger._logLevel).toBe(LogLevel.DEBUG);
    });

    it('should set log level to INFO', () => {
      Logger.setLogLevel(LogLevel.INFO);
      expect(Logger._logLevel).toBe(LogLevel.INFO);
    });

    it('should set log level to LOG', () => {
      Logger.setLogLevel(LogLevel.LOG);
      expect(Logger._logLevel).toBe(LogLevel.LOG);
    });

    it('should set log level to WARN', () => {
      Logger.setLogLevel(LogLevel.WARN);
      expect(Logger._logLevel).toBe(LogLevel.WARN);
    });

    it('should set log level to ERROR', () => {
      Logger.setLogLevel(LogLevel.ERROR);
      expect(Logger._logLevel).toBe(LogLevel.ERROR);
    });

    it('should set log level to NONE', () => {
      Logger.setLogLevel(LogLevel.NONE);
      expect(Logger._logLevel).toBe(LogLevel.NONE);
    });

    it('should ignore invalid log levels (too low)', () => {
      Logger.setLogLevel(LogLevel.LOG);
      Logger.setLogLevel(-1);
      expect(Logger._logLevel).toBe(LogLevel.LOG); // Should remain unchanged
    });

    it('should ignore invalid log levels (too high)', () => {
      Logger.setLogLevel(LogLevel.LOG);
      Logger.setLogLevel(10);
      expect(Logger._logLevel).toBe(LogLevel.LOG); // Should remain unchanged
    });
  });

  describe('setDebugEnabled', () => {
    it('should enable debug mode', () => {
      Logger.setDebugEnabled(true);
      expect(Logger._debugEnabled).toBe(true);
      expect(Logger._logLevel).toBe(LogLevel.DEBUG);
    });

    it('should disable debug mode', () => {
      Logger.setDebugEnabled(true);
      Logger.setDebugEnabled(false);
      expect(Logger._debugEnabled).toBe(false);
    });

    it('should convert truthy values to boolean', () => {
      Logger.setDebugEnabled('yes');
      expect(Logger._debugEnabled).toBe(true);
    });

    it('should convert falsy values to boolean', () => {
      Logger.setDebugEnabled(null);
      expect(Logger._debugEnabled).toBe(false);
    });
  });

  describe('debug', () => {
    it('should log debug message when debug is enabled', () => {
      Logger.setDebugEnabled(true);
      Logger.debug('test message');
      expect(console.debug).toHaveBeenCalledWith('vox-chronicle | [DEBUG]', 'test message');
    });

    it('should not log debug message when debug is disabled', () => {
      Logger.setDebugEnabled(false);
      Logger.debug('test message');
      expect(console.debug).not.toHaveBeenCalled();
    });

    it('should not log debug message when log level is too high', () => {
      Logger.setDebugEnabled(true);
      Logger.setLogLevel(LogLevel.INFO);
      Logger.debug('test message');
      expect(console.debug).not.toHaveBeenCalled();
    });

    it('should handle multiple arguments', () => {
      Logger.setDebugEnabled(true);
      Logger.debug('message', { foo: 'bar' }, 123);
      expect(console.debug).toHaveBeenCalledWith(
        'vox-chronicle | [DEBUG]',
        'message',
        { foo: 'bar' },
        123
      );
    });
  });

  describe('info', () => {
    it('should log info message at INFO level', () => {
      Logger.setLogLevel(LogLevel.INFO);
      Logger.info('test message');
      expect(console.info).toHaveBeenCalledWith('vox-chronicle | [INFO]', 'test message');
    });

    it('should log info message at DEBUG level', () => {
      Logger.setLogLevel(LogLevel.DEBUG);
      Logger.info('test message');
      expect(console.info).toHaveBeenCalledWith('vox-chronicle | [INFO]', 'test message');
    });

    it('should not log info message at LOG level', () => {
      Logger.setLogLevel(LogLevel.LOG);
      Logger.info('test message');
      expect(console.info).not.toHaveBeenCalled();
    });

    it('should not log info message at WARN level', () => {
      Logger.setLogLevel(LogLevel.WARN);
      Logger.info('test message');
      expect(console.info).not.toHaveBeenCalled();
    });

    it('should handle multiple arguments', () => {
      Logger.setLogLevel(LogLevel.INFO);
      Logger.info('message', 'arg2', 'arg3');
      expect(console.info).toHaveBeenCalledWith(
        'vox-chronicle | [INFO]',
        'message',
        'arg2',
        'arg3'
      );
    });
  });

  describe('log', () => {
    it('should log message at LOG level (default)', () => {
      Logger.log('test message');
      expect(console.log).toHaveBeenCalledWith('vox-chronicle |', 'test message');
    });

    it('should log message at DEBUG level', () => {
      Logger.setLogLevel(LogLevel.DEBUG);
      Logger.log('test message');
      expect(console.log).toHaveBeenCalledWith('vox-chronicle |', 'test message');
    });

    it('should not log message at WARN level', () => {
      Logger.setLogLevel(LogLevel.WARN);
      Logger.log('test message');
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should not log message at ERROR level', () => {
      Logger.setLogLevel(LogLevel.ERROR);
      Logger.log('test message');
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should handle multiple arguments', () => {
      Logger.log('message', { data: 'value' });
      expect(console.log).toHaveBeenCalledWith('vox-chronicle |', 'message', { data: 'value' });
    });
  });

  describe('warn', () => {
    it('should log warning at WARN level', () => {
      Logger.setLogLevel(LogLevel.WARN);
      Logger.warn('test warning');
      expect(console.warn).toHaveBeenCalledWith('vox-chronicle | [WARN]', 'test warning');
    });

    it('should log warning at LOG level', () => {
      Logger.setLogLevel(LogLevel.LOG);
      Logger.warn('test warning');
      expect(console.warn).toHaveBeenCalledWith('vox-chronicle | [WARN]', 'test warning');
    });

    it('should not log warning at ERROR level', () => {
      Logger.setLogLevel(LogLevel.ERROR);
      Logger.warn('test warning');
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should handle multiple arguments', () => {
      Logger.warn('warning', 'details', { code: 123 });
      expect(console.warn).toHaveBeenCalledWith('vox-chronicle | [WARN]', 'warning', 'details', {
        code: 123
      });
    });
  });

  describe('error', () => {
    it('should log error at ERROR level', () => {
      Logger.setLogLevel(LogLevel.ERROR);
      Logger.error('test error');
      expect(console.error).toHaveBeenCalledWith('vox-chronicle | [ERROR]', 'test error');
    });

    it('should log error at LOG level', () => {
      Logger.setLogLevel(LogLevel.LOG);
      Logger.error('test error');
      expect(console.error).toHaveBeenCalledWith('vox-chronicle | [ERROR]', 'test error');
    });

    it('should not log error at NONE level', () => {
      Logger.setLogLevel(LogLevel.NONE);
      Logger.error('test error');
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should handle error objects', () => {
      const error = new Error('test error');
      Logger.error('Failed:', error);
      expect(console.error).toHaveBeenCalledWith('vox-chronicle | [ERROR]', 'Failed:', error);
    });

    it('should handle multiple arguments', () => {
      Logger.error('error', 'message', { stack: 'trace' });
      expect(console.error).toHaveBeenCalledWith('vox-chronicle | [ERROR]', 'error', 'message', {
        stack: 'trace'
      });
    });
  });

  describe('group', () => {
    it('should create collapsed group by default', () => {
      Logger.group('Test Group');
      expect(console.groupCollapsed).toHaveBeenCalledWith('vox-chronicle | Test Group');
      expect(console.group).not.toHaveBeenCalled();
    });

    it('should create collapsed group when collapsed=true', () => {
      Logger.group('Test Group', true);
      expect(console.groupCollapsed).toHaveBeenCalledWith('vox-chronicle | Test Group');
      expect(console.group).not.toHaveBeenCalled();
    });

    it('should create expanded group when collapsed=false', () => {
      Logger.group('Test Group', false);
      expect(console.group).toHaveBeenCalledWith('vox-chronicle | Test Group');
      expect(console.groupCollapsed).not.toHaveBeenCalled();
    });
  });

  describe('groupEnd', () => {
    it('should end console group', () => {
      Logger.groupEnd();
      expect(console.groupEnd).toHaveBeenCalled();
    });
  });

  describe('time and timeEnd', () => {
    let performanceNowMock;

    beforeEach(() => {
      performanceNowMock = vi.spyOn(performance, 'now');
    });

    afterEach(() => {
      performanceNowMock.mockRestore();
    });

    it('should start and end timer successfully', () => {
      Logger.setDebugEnabled(true);
      performanceNowMock.mockReturnValueOnce(1000);
      Logger.time('test-timer');

      expect(console.debug).toHaveBeenCalledWith(
        'vox-chronicle | [DEBUG]',
        'Timer started: test-timer'
      );
      expect(Logger._timers.has('test-timer')).toBe(true);

      console.log.mockClear();
      performanceNowMock.mockReturnValueOnce(1500);
      const elapsed = Logger.timeEnd('test-timer');

      expect(elapsed).toBe(500);
      expect(console.log).toHaveBeenCalledWith('vox-chronicle |', 'test-timer: 500.00ms');
      expect(Logger._timers.has('test-timer')).toBe(false);
    });

    it('should handle timer not found', () => {
      const elapsed = Logger.timeEnd('nonexistent-timer');

      expect(elapsed).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        'vox-chronicle | [WARN]',
        'Timer "nonexistent-timer" not found'
      );
    });

    it('should calculate elapsed time correctly', () => {
      performanceNowMock.mockReturnValueOnce(2000);
      Logger.time('timer-2');

      performanceNowMock.mockReturnValueOnce(2123.456);
      const elapsed = Logger.timeEnd('timer-2');

      expect(elapsed).toBeCloseTo(123.456, 2);
    });

    it('should remove timer after timeEnd', () => {
      performanceNowMock.mockReturnValueOnce(1000);
      Logger.time('temp-timer');
      expect(Logger._timers.has('temp-timer')).toBe(true);

      performanceNowMock.mockReturnValueOnce(2000);
      Logger.timeEnd('temp-timer');
      expect(Logger._timers.has('temp-timer')).toBe(false);
    });
  });

  describe('table', () => {
    it('should log table when log level is DEBUG', () => {
      Logger.setDebugEnabled(true);
      const data = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 }
      ];
      Logger.table(data);

      expect(console.log).toHaveBeenCalledWith('vox-chronicle | Table:');
      expect(console.table).toHaveBeenCalledWith(data, undefined);
    });

    it('should log table with specific columns', () => {
      Logger.setDebugEnabled(true);
      const data = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 }
      ];
      const columns = ['name'];
      Logger.table(data, columns);

      expect(console.log).toHaveBeenCalledWith('vox-chronicle | Table:');
      expect(console.table).toHaveBeenCalledWith(data, columns);
    });

    it('should not log table when log level is too high', () => {
      Logger.setLogLevel(LogLevel.LOG);
      const data = [{ name: 'Alice' }];
      Logger.table(data);

      expect(console.log).not.toHaveBeenCalled();
      expect(console.table).not.toHaveBeenCalled();
    });
  });

  describe('dir', () => {
    it('should log object with console.dir when log level is DEBUG', () => {
      Logger.setDebugEnabled(true);
      const obj = { foo: 'bar', nested: { value: 123 } };
      Logger.dir('Test Object', obj);

      expect(console.log).toHaveBeenCalledWith('vox-chronicle | Test Object:');
      expect(console.dir).toHaveBeenCalledWith(obj);
    });

    it('should not log when log level is too high', () => {
      Logger.setLogLevel(LogLevel.LOG);
      const obj = { foo: 'bar' };
      Logger.dir('Test Object', obj);

      expect(console.log).not.toHaveBeenCalled();
      expect(console.dir).not.toHaveBeenCalled();
    });
  });

  describe('trace', () => {
    it('should log trace when log level is DEBUG', () => {
      Logger.setDebugEnabled(true);
      Logger.trace('stack trace');

      expect(console.trace).toHaveBeenCalledWith('vox-chronicle | [TRACE]', 'stack trace');
    });

    it('should not log trace when log level is too high', () => {
      Logger.setLogLevel(LogLevel.LOG);
      Logger.trace('stack trace');

      expect(console.trace).not.toHaveBeenCalled();
    });

    it('should handle multiple arguments', () => {
      Logger.setDebugEnabled(true);
      Logger.trace('trace', 'arg1', 'arg2');

      expect(console.trace).toHaveBeenCalledWith(
        'vox-chronicle | [TRACE]',
        'trace',
        'arg1',
        'arg2'
      );
    });
  });

  describe('assert', () => {
    it('should call console.assert with module prefix', () => {
      Logger.assert(false, 'assertion failed');

      expect(console.assert).toHaveBeenCalledWith(
        false,
        'vox-chronicle | [ASSERT]',
        'assertion failed'
      );
    });

    it('should pass true condition', () => {
      Logger.assert(true, 'this should not log');

      expect(console.assert).toHaveBeenCalledWith(
        true,
        'vox-chronicle | [ASSERT]',
        'this should not log'
      );
    });

    it('should handle multiple arguments', () => {
      Logger.assert(false, 'failed', { data: 'value' });

      expect(console.assert).toHaveBeenCalledWith(false, 'vox-chronicle | [ASSERT]', 'failed', {
        data: 'value'
      });
    });
  });

  describe('clear', () => {
    it('should clear console and log message', () => {
      Logger.clear();

      expect(console.clear).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('vox-chronicle |', 'Console cleared');
    });
  });

  describe('createChild', () => {
    describe('without sanitization', () => {
      it('should create child logger with correct prefix', () => {
        const child = Logger.createChild('TestModule');
        child.log('test message');

        expect(console.log).toHaveBeenCalledWith('vox-chronicle:TestModule |', 'test message');
      });

      it('should support debug method', () => {
        Logger.setDebugEnabled(true);
        const child = Logger.createChild('TestModule');
        child.debug('debug message');

        expect(console.debug).toHaveBeenCalledWith(
          'vox-chronicle:TestModule | [DEBUG]',
          'debug message'
        );
      });

      it('should support info method', () => {
        Logger.setLogLevel(LogLevel.INFO);
        const child = Logger.createChild('TestModule');
        child.info('info message');

        expect(console.info).toHaveBeenCalledWith(
          'vox-chronicle:TestModule | [INFO]',
          'info message'
        );
      });

      it('should support warn method', () => {
        const child = Logger.createChild('TestModule');
        child.warn('warn message');

        expect(console.warn).toHaveBeenCalledWith(
          'vox-chronicle:TestModule | [WARN]',
          'warn message'
        );
      });

      it('should support error method', () => {
        const child = Logger.createChild('TestModule');
        child.error('error message');

        expect(console.error).toHaveBeenCalledWith(
          'vox-chronicle:TestModule | [ERROR]',
          'error message'
        );
      });

      it('should support group method with collapsed=true', () => {
        const child = Logger.createChild('TestModule');
        child.group('Test Group', true);

        expect(console.groupCollapsed).toHaveBeenCalledWith(
          'vox-chronicle:TestModule | Test Group'
        );
      });

      it('should support group method with collapsed=false', () => {
        const child = Logger.createChild('TestModule');
        child.group('Test Group', false);

        expect(console.group).toHaveBeenCalledWith('vox-chronicle:TestModule | Test Group');
      });

      it('should support groupEnd method', () => {
        const child = Logger.createChild('TestModule');
        child.groupEnd();

        expect(console.groupEnd).toHaveBeenCalled();
      });

      it('should support time method with prefixed label', () => {
        Logger.setDebugEnabled(true);
        const child = Logger.createChild('TestModule');
        const performanceNowMock = vi.spyOn(performance, 'now').mockReturnValue(1000);

        child.time('operation');

        expect(Logger._timers.has('TestModule:operation')).toBe(true);
        performanceNowMock.mockRestore();
      });

      it('should support timeEnd method with prefixed label', () => {
        const child = Logger.createChild('TestModule');
        const performanceNowMock = vi.spyOn(performance, 'now');
        performanceNowMock.mockReturnValueOnce(1000);

        child.time('operation');

        performanceNowMock.mockReturnValueOnce(1500);
        const elapsed = child.timeEnd('operation');

        expect(elapsed).toBe(500);
        expect(console.log).toHaveBeenCalledWith(
          'vox-chronicle |',
          'TestModule:operation: 500.00ms'
        );
        performanceNowMock.mockRestore();
      });
    });

    describe('with sanitization (boolean)', () => {
      it('should create child logger with sanitization enabled', () => {
        const child = Logger.createChild('SecureModule', true);
        // Sanitization behavior is tested in SensitiveDataFilter tests
        // Here we just verify the child was created
        child.log('test');
        expect(console.log).toHaveBeenCalled();
      });

      it('should create child logger with sanitization disabled', () => {
        const child = Logger.createChild('SecureModule', false);
        child.log('test');
        expect(console.log).toHaveBeenCalled();
      });
    });

    describe('with sanitization (object)', () => {
      it('should create child logger with sanitization enabled via object', () => {
        const child = Logger.createChild('SecureModule', { sanitize: true });
        child.log('test');
        expect(console.log).toHaveBeenCalled();
      });

      it('should create child logger with sanitization disabled via object', () => {
        const child = Logger.createChild('SecureModule', { sanitize: false });
        child.log('test');
        expect(console.log).toHaveBeenCalled();
      });

      it('should default to no sanitization if object is empty', () => {
        const child = Logger.createChild('SecureModule', {});
        child.log('test');
        expect(console.log).toHaveBeenCalled();
      });
    });

    describe('child logger respects parent log level', () => {
      it('should not log debug when debug is disabled', () => {
        Logger.setDebugEnabled(false);
        const child = Logger.createChild('TestModule');
        child.debug('should not log');

        expect(console.debug).not.toHaveBeenCalled();
      });

      it('should not log info when log level is LOG', () => {
        Logger.setLogLevel(LogLevel.LOG);
        const child = Logger.createChild('TestModule');
        child.info('should not log');

        expect(console.info).not.toHaveBeenCalled();
      });

      it('should not log warn when log level is ERROR', () => {
        Logger.setLogLevel(LogLevel.ERROR);
        const child = Logger.createChild('TestModule');
        child.warn('should not log');

        expect(console.warn).not.toHaveBeenCalled();
      });
    });

    describe('multiple child loggers', () => {
      it('should create multiple independent child loggers', () => {
        const child1 = Logger.createChild('Module1');
        const child2 = Logger.createChild('Module2');

        child1.log('from module 1');
        child2.log('from module 2');

        expect(console.log).toHaveBeenCalledWith('vox-chronicle:Module1 |', 'from module 1');
        expect(console.log).toHaveBeenCalledWith('vox-chronicle:Module2 |', 'from module 2');
      });
    });
  });

  describe('integration - log level filtering', () => {
    it('should filter all logs at NONE level', () => {
      Logger.setLogLevel(LogLevel.NONE);
      // Note: Do not enable debug mode as it would override the log level to DEBUG

      Logger.debug('debug');
      Logger.info('info');
      Logger.log('log');
      Logger.warn('warn');
      Logger.error('error');

      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should allow only ERROR at ERROR level', () => {
      Logger.setLogLevel(LogLevel.ERROR);

      Logger.info('info');
      Logger.log('log');
      Logger.warn('warn');
      Logger.error('error');

      expect(console.info).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it('should allow WARN and ERROR at WARN level', () => {
      Logger.setLogLevel(LogLevel.WARN);

      Logger.info('info');
      Logger.log('log');
      Logger.warn('warn');
      Logger.error('error');

      expect(console.info).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it('should allow LOG, WARN, and ERROR at LOG level (default)', () => {
      Logger.setLogLevel(LogLevel.LOG);

      Logger.info('info');
      Logger.log('log');
      Logger.warn('warn');
      Logger.error('error');

      expect(console.info).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it('should allow all except DEBUG at INFO level', () => {
      Logger.setDebugEnabled(true); // This sets level to DEBUG
      Logger.setLogLevel(LogLevel.INFO); // Then override to INFO

      Logger.debug('debug');
      Logger.info('info');
      Logger.log('log');
      Logger.warn('warn');
      Logger.error('error');

      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it('should allow all logs at DEBUG level when debug enabled', () => {
      Logger.setDebugEnabled(true);

      Logger.debug('debug');
      Logger.info('info');
      Logger.log('log');
      Logger.warn('warn');
      Logger.error('error');

      expect(console.debug).toHaveBeenCalled();
      expect(console.info).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
  });
});
