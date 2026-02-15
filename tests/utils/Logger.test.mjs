import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, LogLevel } from '../../scripts/utils/Logger.mjs';

describe('Logger', () => {
  beforeEach(() => {
    Logger.setDebugEnabled(false);
    Logger.setLogLevel(LogLevel.LOG);
  });

  describe('setDebugMode', () => {
    it('enables debug mode', () => {
      Logger.setDebugMode(true);
      expect(Logger.isDebugMode()).toBe(true);
    });

    it('disables debug mode', () => {
      Logger.setDebugMode(true);
      Logger.setDebugMode(false);
      expect(Logger.isDebugMode()).toBe(false);
    });

    it('is an alias for setDebugEnabled', () => {
      Logger.setDebugMode(true);
      expect(Logger._debugEnabled).toBe(true);
      Logger.setDebugEnabled(false);
      expect(Logger.isDebugMode()).toBe(false);
    });
  });

  describe('isDebugMode', () => {
    it('returns false by default', () => {
      expect(Logger.isDebugMode()).toBe(false);
    });

    it('returns true after enabling debug', () => {
      Logger.setDebugEnabled(true);
      expect(Logger.isDebugMode()).toBe(true);
    });
  });

  describe('debug suppression', () => {
    it('suppresses debug messages when debug mode is off', () => {
      Logger.setDebugMode(false);
      Logger.setLogLevel(LogLevel.DEBUG);
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      Logger.debug('test message');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('shows debug messages when debug mode is on', () => {
      Logger.setDebugMode(true);
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      Logger.debug('test message');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('child logger debug suppression', () => {
    it('suppresses child debug when debug mode is off', () => {
      Logger.setDebugMode(false);
      Logger.setLogLevel(LogLevel.DEBUG);
      const child = Logger.createChild('TestChild');
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      child.debug('test');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('shows child debug when debug mode is on', () => {
      Logger.setDebugMode(true);
      const child = Logger.createChild('TestChild');
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      child.debug('test');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
