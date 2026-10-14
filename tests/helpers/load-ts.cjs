const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');

// Run application modules with explicit dependency mocks, without loading .env
// or connecting to Supabase. Each load gets an isolated module cache.
function loadTs(modulePath, mocks = {}) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} };
    cache.set(filename, mod);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: filename,
    }).outputText;
    function localRequire(id) {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === 'server-only') return {};
      if (id === '@/lib/supabaseServer') {
        throw new Error('Tests must mock Supabase; live database access is forbidden.');
      }
      if (id.startsWith('@/') || id.startsWith('.')) {
        const base = id.startsWith('@/') ? path.join(root, id.slice(2)) : path.resolve(path.dirname(filename), id);
        const resolved = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]
          .find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
        if (!resolved) throw new Error(`Cannot resolve ${id}`);
        return load(resolved);
      }
      return require(id);
    }
    new Function('require', 'module', 'exports', '__filename', '__dirname', code)(
      localRequire, mod, mod.exports, filename, path.dirname(filename),
    );
    return mod.exports;
  }
  return load(path.resolve(root, modulePath));
}

module.exports = { loadTs };
