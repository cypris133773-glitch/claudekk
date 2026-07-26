// Builds the whole game into one self-contained HTML file.
//
//   node tools/bundle.js [outfile]        # default: dist/blockfray.html
//
// Useful for anywhere a multi-file ES module tree is awkward: itch.io uploads,
// a single-file drop into a desktop wrapper, sharing a build over chat, or any
// host that will not serve directories. The output has no external requests at
// all — CSS, JS, textures and audio are already generated in code.
//
// The source uses a deliberately small slice of module syntax (named imports,
// named exports, no defaults, no namespace imports), so a tiny registry shim
// is enough and no bundler dependency is needed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'src/main.js';
// --fragment emits the page contents without the document skeleton, for hosts
// that supply their own <html>/<head>/<body> wrapper.
const FRAGMENT = process.argv.includes('--fragment');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const OUT = args[0] || (FRAGMENT ? 'dist/blockfray-fragment.html' : 'dist/blockfray.html');

const modules = new Map();

function resolveFrom(fromFile, spec) {
  const p = path.normalize(path.join(path.dirname(fromFile), spec));
  return p.split(path.sep).join('/');
}

/** Rewrite one module's import/export syntax into registry calls. */
function transform(file, src) {
  const exported = new Set();
  let out = src;

  // import { a, b as c } from './x.js';  ->  const { a, b: c } = __req('x.js');
  out = out.replace(
    /^import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]\s*;?/gm,
    (_m, names, spec) => {
      const resolved = resolveFrom(file, spec);
      if (!modules.has(resolved)) load(resolved);
      const bindings = names.split(',').map((n) => n.trim()).filter(Boolean)
        .map((n) => {
          const m = n.match(/^(\S+)\s+as\s+(\S+)$/);
          return m ? `${m[1]}: ${m[2]}` : n;
        }).join(', ');
      return `const { ${bindings} } = __req(${JSON.stringify(resolved)});`;
    });

  // Bare side-effect imports are not used, but drop them defensively.
  out = out.replace(/^import\s*['"][^'"]+['"]\s*;?/gm, '');

  // export { a, b };  -> record names, drop the statement
  out = out.replace(/^export\s*\{([^}]*)\}\s*;?/gm, (_m, names) => {
    for (const n of names.split(',')) {
      const name = n.trim().split(/\s+as\s+/).pop();
      if (name) exported.add(name);
    }
    return '';
  });

  // export class/function/const/let  -> strip the keyword, record the name
  out = out.replace(
    /^export\s+(async\s+function|function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
    (_m, kind, name) => { exported.add(name); return `${kind} ${name}`; });

  const unhandled = out.match(/^export\s+/m);
  if (unhandled) throw new Error(`${file}: unsupported export syntax near "${unhandled[0]}"`);

  return { code: out, exported: [...exported] };
}

function load(rel) {
  if (modules.has(rel)) return;
  modules.set(rel, null);                       // reserve, so cycles terminate
  const abs = path.join(ROOT, rel);
  const src = fs.readFileSync(abs, 'utf8');
  const { code, exported } = transform(rel, src);
  modules.set(rel, { code, exported });
}

load(ENTRY);

const registry = [...modules.entries()].map(([name, mod]) => {
  if (!mod) throw new Error(`module ${name} failed to load`);
  const assign = mod.exported.length
    ? `\nObject.assign(__exports, { ${mod.exported.join(', ')} });`
    : '';
  return `__def(${JSON.stringify(name)}, function (__exports, __req) {\n${mod.code}${assign}\n});`;
}).join('\n\n');

const runtime = `
// Minimal module registry standing in for the native loader. Modules are
// evaluated lazily on first require and cached, matching ES module semantics
// closely enough for this source tree.
const __mods = {};
function __def(name, fn) { __mods[name] = { fn, exports: null }; }
function __req(name) {
  const m = __mods[name];
  if (!m) throw new Error('missing module ' + name);
  if (!m.exports) { m.exports = {}; m.fn(m.exports, __req); }
  return m.exports;
}
`;

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

const bundled = html
  .replace(/<link rel="stylesheet"[^>]*>/, `<style>\n${css}\n</style>`)
  .replace(/<link rel="manifest"[^>]*>/, '')
  .replace(
    /<script type="module" src="[^"]*"><\/script>/,
    `<script type="module">\n${runtime}\n${registry}\n\n__req(${JSON.stringify(ENTRY)});\n</script>`);

if (bundled.includes('<script type="module" src=')) {
  throw new Error('entry script tag was not replaced — check index.html');
}

let output = bundled;
if (FRAGMENT) {
  // Keep <title> (hosts read it) and everything inside <body>, drop the rest.
  const title = (bundled.match(/<title>[\s\S]*?<\/title>/) || [''])[0];
  const style = (bundled.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const body = bundled.match(/<body>([\s\S]*?)<\/body>/);
  if (!body) throw new Error('could not find <body> to extract');
  output = `${title}\n${style}\n${body[1].trim()}\n`;
  if (/<!doctype|<html|<head|<body/i.test(output)) {
    throw new Error('fragment still contains document skeleton tags');
  }
}

const outPath = path.join(ROOT, OUT);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, output);

const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
console.log(`${OUT} — ${modules.size} modules, ${kb} KB`
  + (FRAGMENT ? ', fragment' : ', standalone') + ', no external requests');
