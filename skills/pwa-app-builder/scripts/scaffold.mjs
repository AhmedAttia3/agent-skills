#!/usr/bin/env node
/**
 * scaffold.mjs — plants a working "one-process Express + SQLite + React/Vite + PWA" app
 * into a target workspace, using the battle-tested templates that ship with this skill.
 *
 * Usage:
 *   node scripts/scaffold.mjs --dir <target-dir> --name "اسم التطبيق" --name-en "AppName" \
 *        --slug appname --prefix ea --palette orange --ink warm [--with-catalog] [--force]
 *
 * Why a script instead of hand-copying: every template carries the app identity
 * (name, slug, cookie prefix, brand palette) in {{PLACEHOLDERS}}. Doing this by hand
 * across ~40 files is where "ماذا نأكل؟" ends up leaking into a brand-new app.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(HERE, '..', 'assets', 'templates');

/* ------------------------------- palettes -------------------------------- */
const str = (r) => ({ 50: r[0], 100: r[1], 200: r[2], 300: r[3], 400: r[4], 500: r[5], 600: r[6], 700: r[7], 800: r[8], 900: r[9] });

const PALETTES = {
  orange: str(['#fff7ed', '#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12']),
  amber: str(['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f']),
  rose: str(['#fff1f2', '#ffe4e6', '#fecdd3', '#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c', '#9f1239', '#881337']),
  violet: str(['#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95']),
  indigo: str(['#eef2ff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81']),
  sky: str(['#f0f9ff', '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985', '#0c4a6e']),
  teal: str(['#f0fdfa', '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59', '#134e4a']),
  emerald: str(['#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#065f46', '#064e3b']),
};

const INKS = {
  warm: str(['#f8f7f6', '#efeceb', '#ded9d7', '#c2bab6', '#9c918b', '#7d716b', '#655b56', '#524a46', '#2e2926', '#1b1815']),
  cool: str(['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a']),
  stone: str(['#fafaf9', '#f5f5f4', '#e7e5e4', '#d6d3d1', '#a8a29e', '#78716c', '#57534e', '#44403c', '#292524', '#1c1917']),
};

// NOTE: no leading indentation on the first line — the placeholder sits on a line
// that already carries 8 spaces of indentation inside tailwind.config.cjs.
const rampBlock = (key, ramp) => `${key}: {\n${Object.entries(ramp).map(([k, v]) => `          ${k}: '${v}',`).join('\n')}\n        },`;

/* --------------------------------- args ---------------------------------- */
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const usage = `Usage: node scripts/scaffold.mjs --dir <target> --name "<AR name>" --name-en "<EN name>" --slug <slug> --prefix <2-3 letters> [--palette ${Object.keys(PALETTES).join('|')}] [--ink ${Object.keys(INKS).join('|')}] [--with-catalog] [--force]`;

if (!args.dir || !args.name || !args['name-en'] || !args.slug) {
  console.error(usage);
  process.exit(1);
}

const target = path.resolve(args.dir);
const paletteName = args.palette || 'orange';
const inkName = args.ink || 'warm';
const fail = (message) => {
  console.error(`✋ ${message}`);
  process.exit(1);
};
if (!PALETTES[paletteName]) fail(`unknown palette "${paletteName}" — pick one of ${Object.keys(PALETTES).join(', ')}`);
if (!INKS[inkName]) fail(`unknown ink "${inkName}" — pick one of ${Object.keys(INKS).join(', ')}`);

const brand = PALETTES[paletteName];
const ink = INKS[inkName];
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');

const values = {
  '{{APP_NAME}}': args.name,
  '{{APP_NAME_EN}}': args['name-en'],
  '{{APP_SLUG}}': args.slug,
  '{{PREFIX}}': args.prefix || args.slug.slice(0, 2),
  '{{BRAND_RAMP}}': rampBlock('brand', brand),
  '{{INK_RAMP}}': rampBlock('ink', ink),
  '{{BRAND_50}}': brand[50],
  '{{BRAND_400}}': brand[400],
  '{{BRAND_600}}': brand[600],
  '{{BRAND_600_RGB}}': rgb(brand[600]),
  '{{BRAND_HEX_TUPLE}}': `0x${brand[600].slice(1, 3).toUpperCase()}, 0x${brand[600].slice(3, 5).toUpperCase()}, 0x${brand[600].slice(5, 7).toUpperCase()}`,
  '{{THEME_LIGHT}}': brand[50],
  '{{THEME_DARK}}': ink[900],
};

/* -------------------------------- copying -------------------------------- */
const TEXT = /\.(js|jsx|mjs|cjs|json|html|css|py|sh|md|webmanifest|gitignore)$/;
// The demo-domain smoke test is shipped as a reading reference, but it is ALSO the
// thing `npm run test:api` runs — so it lands in the new project under its real name.
// A green `npm run test:api` on minute one is what proves the whole pipeline works.
const RENAME = { 'smoke-test.reference.js': 'smoke-test.js' };
const PLAN = [
  { from: 'infra', to: '.' },
  { from: 'scripts', to: 'scripts' },
  { from: 'server', to: 'server' },
  { from: 'web', to: 'web' },
];

if (fs.existsSync(target) && fs.readdirSync(target).length && !args.force) {
  console.error(`✋ ${target} is not empty. Re-run with --force if you really want to write into it.`);
  process.exit(1);
}
fs.mkdirSync(target, { recursive: true });

let written = 0;
const copied = [];

function copyTree(fromDir, toDir) {
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const src = path.join(fromDir, entry.name);
    const dest = path.join(toDir, RENAME[entry.name] || entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      copyTree(src, dest);
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (TEXT.test(entry.name) || entry.name === '.gitignore') {
      let text = fs.readFileSync(src, 'utf8');
      for (const [token, value] of Object.entries(values)) text = text.split(token).join(value);
      fs.writeFileSync(dest, text);
    } else {
      fs.copyFileSync(src, dest);
    }
    written += 1;
    copied.push(path.relative(target, dest));
  }
}

for (const step of PLAN) copyTree(path.join(TEMPLATES, step.from), path.resolve(target, step.to));

if (args['with-catalog']) {
  copyTree(path.join(TEMPLATES, 'optional-catalog', 'data-catalog'), path.join(target, 'data', 'catalog'));
  for (const file of ['catalog.js']) {
    fs.mkdirSync(path.join(target, 'server', 'routes'), { recursive: true });
    let text = fs.readFileSync(path.join(TEMPLATES, 'optional-catalog', file), 'utf8');
    for (const [token, value] of Object.entries(values)) text = text.split(token).join(value);
    fs.writeFileSync(path.join(target, 'server', 'routes', file), text);
    written += 1;
  }
  for (const file of ['catalog-sync.js', 'catalog-images.js']) {
    fs.mkdirSync(path.join(target, 'scripts'), { recursive: true });
    let text = fs.readFileSync(path.join(TEMPLATES, 'optional-catalog', file), 'utf8');
    for (const [token, value] of Object.entries(values)) text = text.split(token).join(value);
    fs.writeFileSync(path.join(target, 'scripts', file), text);
    written += 1;
  }
}

// executable bits that must survive the copy
for (const rel of fs.readdirSync(path.join(target, 'scripts'))) {
  if (rel.endsWith('.sh')) fs.chmodSync(path.join(target, 'scripts', rel), 0o755);
}
fs.chmodSync(path.join(target, 'scripts', 'gen-icons.py'), 0o755);

/* ------------------------------- leftovers ------------------------------- */
const leftovers = [];
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      scan(full);
      continue;
    }
    if (!/\.(js|jsx|mjs|cjs|json|html|css|py|sh|md|webmanifest)$/.test(entry.name) && entry.name !== '.gitignore') continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const token of [/\{\{[A-Z_0-9_]+\}\}/, 'ماذا نأكل؟', 'EatWhat', 'eatwhat']) {
      const hit = token instanceof RegExp ? text.match(token) : text.includes(token) ? token : null;
      if (hit) leftovers.push(`${path.relative(target, full)} :: ${token instanceof RegExp ? hit[0] : token}`);
    }
  }
}
scan(target);

console.log(`✅ scaffolded ${written} files into ${target}`);
console.log(`   app: ${args.name} (${args['name-en']}) · slug=${args.slug} · cookie=${values['{{PREFIX}}']}_session · palette=${paletteName}/${inkName}`);
if (leftovers.length) {
  console.log(`\n⚠️  ${leftovers.length} file(s) still carry demo/domain leftovers — rewrite them for your domain:`);
  for (const item of [...new Set(leftovers)].slice(0, 40)) console.log(`   - ${item}`);
}
console.log(`
next steps (see SKILL.md phase 3+):
  export PATH="$HOME/node-v24.20.0-linux-x64/bin:$PATH"
  npm install                     # run in background with a log on low-RAM hosts
  npm run build
  ./scripts/run.sh start && curl -s http://127.0.0.1:3000/api/health
  npm run test:api
`);
