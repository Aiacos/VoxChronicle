/**
 * Static Analysis Tests - Module Import Validation
 *
 * These tests scan all source files for common import issues that would cause
 * ES module SyntaxErrors at load time. Such errors crash the entire module in
 * Foundry VTT, preventing settings and scene controls from registering.
 *
 * Catches issues like:
 * - Duplicate named imports (SyntaxError: Identifier already declared)
 * - Circular import chains that could cause undefined bindings
 * - Missing source files referenced by imports
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SCRIPTS_DIR = path.resolve(__dirname, '../../scripts');

/**
 * Recursively find all .mjs files under a directory
 */
function findMjsFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findMjsFiles(fullPath));
    } else if (entry.name.endsWith('.mjs')) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Extract all named import bindings from a source file
 * Returns array of { name, from, line } objects
 */
function extractImports(content) {
  const imports = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match: import { Foo, Bar } from './path.mjs';
    const match = line.match(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
    if (match) {
      const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/).pop().trim());
      const from = match[2];
      for (const name of names) {
        if (name) {
          imports.push({ name, from, line: i + 1 });
        }
      }
    }

    // Match: import DefaultExport from './path.mjs';
    const defaultMatch = line.match(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
    if (defaultMatch && !line.includes('{')) {
      imports.push({ name: defaultMatch[1], from: defaultMatch[2], line: i + 1 });
    }
  }

  return imports;
}

describe('Module Import Static Analysis', () => {
  const allFiles = findMjsFiles(SCRIPTS_DIR);
  const relPath = (f) => path.relative(path.resolve(__dirname, '../..'), f);

  it('should find source files to analyze', () => {
    expect(allFiles.length).toBeGreaterThan(10);
  });

  describe('no duplicate named imports', () => {
    for (const file of allFiles) {
      const rel = relPath(file);

      it(`${rel} has no duplicate import bindings`, () => {
        const content = fs.readFileSync(file, 'utf8');
        const imports = extractImports(content);
        const seen = new Map();
        const duplicates = [];

        for (const imp of imports) {
          if (seen.has(imp.name)) {
            const prev = seen.get(imp.name);
            duplicates.push(
              `"${imp.name}" imported at line ${prev.line} (from '${prev.from}') ` +
              `and again at line ${imp.line} (from '${imp.from}')`
            );
          } else {
            seen.set(imp.name, imp);
          }
        }

        expect(duplicates, `Duplicate imports in ${rel}:\n${duplicates.join('\n')}`).toHaveLength(0);
      });
    }
  });

  describe('import targets exist', () => {
    for (const file of allFiles) {
      const rel = relPath(file);

      it(`${rel} imports reference existing files`, () => {
        const content = fs.readFileSync(file, 'utf8');
        const imports = extractImports(content);
        const missing = [];

        for (const imp of imports) {
          // Only check relative imports (skip bare specifiers like 'vitest')
          if (!imp.from.startsWith('.')) continue;

          const resolved = path.resolve(path.dirname(file), imp.from);
          if (!fs.existsSync(resolved)) {
            missing.push(`line ${imp.line}: '${imp.from}' → ${resolved} does not exist`);
          }
        }

        expect(missing, `Missing import targets in ${rel}:\n${missing.join('\n')}`).toHaveLength(0);
      });
    }
  });

  describe('no circular import chains in entry point', () => {
    it('main.mjs top-level imports do not form circular chains', () => {
      const mainFile = path.join(SCRIPTS_DIR, 'main.mjs');
      expect(fs.existsSync(mainFile), 'main.mjs must exist').toBe(true);

      const visited = new Set();
      const chain = [];
      const circles = [];

      function walk(file) {
        const resolved = fs.realpathSync(file);
        if (visited.has(resolved)) {
          const idx = chain.indexOf(resolved);
          if (idx !== -1) {
            circles.push(chain.slice(idx).map(relPath).join(' → ') + ' → ' + relPath(resolved));
          }
          return;
        }

        visited.add(resolved);
        chain.push(resolved);

        const content = fs.readFileSync(resolved, 'utf8');
        const imports = extractImports(content);

        for (const imp of imports) {
          if (!imp.from.startsWith('.')) continue;
          const target = path.resolve(path.dirname(resolved), imp.from);
          if (fs.existsSync(target)) {
            walk(target);
          }
        }

        chain.pop();
      }

      walk(mainFile);

      expect(circles, `Circular imports detected:\n${circles.join('\n')}`).toHaveLength(0);
    });
  });

  describe('module.json integrity', () => {
    const moduleJsonPath = path.resolve(__dirname, '../../module.json');

    it('module.json is valid JSON', () => {
      const content = fs.readFileSync(moduleJsonPath, 'utf8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('module.json esmodules entry point exists', () => {
      const manifest = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf8'));
      expect(manifest.esmodules).toBeDefined();
      expect(manifest.esmodules.length).toBeGreaterThan(0);

      for (const entry of manifest.esmodules) {
        const entryPath = path.resolve(__dirname, '../..', entry);
        expect(fs.existsSync(entryPath), `Entry point ${entry} must exist`).toBe(true);
      }
    });

    it('module.json styles entry exists', () => {
      const manifest = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf8'));
      if (manifest.styles) {
        for (const style of manifest.styles) {
          const stylePath = path.resolve(__dirname, '../..', style);
          expect(fs.existsSync(stylePath), `Style ${style} must exist`).toBe(true);
        }
      }
    });

    it('module.json language files exist', () => {
      const manifest = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf8'));
      expect(manifest.languages).toBeDefined();

      for (const lang of manifest.languages) {
        const langPath = path.resolve(__dirname, '../..', lang.path);
        expect(fs.existsSync(langPath), `Language file ${lang.path} must exist`).toBe(true);

        // Verify it's valid JSON
        const content = fs.readFileSync(langPath, 'utf8');
        expect(() => JSON.parse(content), `${lang.path} must be valid JSON`).not.toThrow();
      }
    });

    it('module.json version matches download URL version', () => {
      const manifest = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf8'));
      if (manifest.download) {
        const urlVersion = manifest.download.match(/v([\d.]+)\//)?.[1];
        if (urlVersion) {
          expect(urlVersion).toBe(manifest.version);
        }
      }
    });
  });

  describe('i18n key consistency', () => {
    it('all language files have the same keys as en.json', () => {
      const langDir = path.resolve(__dirname, '../../lang');
      const enContent = JSON.parse(fs.readFileSync(path.join(langDir, 'en.json'), 'utf8'));

      function getKeys(obj, prefix = '') {
        let keys = [];
        for (const [k, v] of Object.entries(obj)) {
          const key = prefix ? `${prefix}.${k}` : k;
          if (typeof v === 'object' && v !== null) {
            keys.push(...getKeys(v, key));
          } else {
            keys.push(key);
          }
        }
        return keys;
      }

      const enKeys = new Set(getKeys(enContent));
      const langFiles = fs.readdirSync(langDir).filter(f => f.endsWith('.json') && f !== 'en.json');

      for (const langFile of langFiles) {
        const langContent = JSON.parse(fs.readFileSync(path.join(langDir, langFile), 'utf8'));
        const langKeys = new Set(getKeys(langContent));

        const missingInLang = [...enKeys].filter(k => !langKeys.has(k));
        const extraInLang = [...langKeys].filter(k => !enKeys.has(k));

        expect(
          missingInLang,
          `${langFile} is missing ${missingInLang.length} keys from en.json: ${missingInLang.slice(0, 5).join(', ')}${missingInLang.length > 5 ? '...' : ''}`
        ).toHaveLength(0);

        expect(
          extraInLang,
          `${langFile} has ${extraInLang.length} extra keys not in en.json: ${extraInLang.slice(0, 5).join(', ')}${extraInLang.length > 5 ? '...' : ''}`
        ).toHaveLength(0);
      }
    });
  });
});
