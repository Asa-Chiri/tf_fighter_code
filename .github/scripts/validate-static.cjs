'use strict';

// Static inspection only: never execute application scripts or fetch URLs.
const fs = require('node:fs');
const path = require('node:path').posix;
const { execFileSync } = require('node:child_process');
const { Script } = require('node:vm');
const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean));
let references = 0;
let scripts = 0;
const errors = [];
const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const fail = message => errors.push(message);

function reference(source, value, root = '.', directory = path.dirname(source)) {
  if (typeof value !== 'string') throw new Error(`${source}: expected a URL string`);
  const url = value.trim();
  if (!url || /^(?:[a-z][a-z0-9+.-]*:|\/\/|[?#])/i.test(url)) return;
  const decoded = decodeURIComponent(url.split(/[?#]/, 1)[0]);
  if (/[\\\x00-\x1f]/.test(decoded)) throw new Error(`${source}: unsafe URL ${value}`);
  const base = decoded.startsWith('/') ? root : directory;
  const target = path.normalize(path.join(base, decoded.replace(/^\/+/, '')));
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    fail(`${source}: URL escapes asset root: ${value}`);
    return;
  }
  references++;
  if (!tracked.has(target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    fail(`${source}: missing tracked asset ${JSON.stringify(value)} -> ${target}`);
    return;
  }
  return target;
}

function syntax(file, text = read(file)) {
  try {
    new Script(text, { filename: file });
    scripts++;
  } catch (error) {
    fail(`${file}: JavaScript syntax: ${error.message}`);
  }
}

function css(file, text, root) {
  for (const match of text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi)) {
    reference(file, match[1] ?? match[2] ?? match[3], root);
  }
}

function html(file, root) {
  const text = read(file).replace(/<!--[\s\S]*?-->/g, '');
  // Covers the simple generated markup in this repository, not arbitrary HTML.
  for (const match of text.matchAll(/<(script|link|img|meta)\b([^>]*?)>/gi)) {
    const attrs = {};
    for (const attr of match[2].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attrs[attr[1].toLowerCase()] = (attr[2] ?? attr[3] ?? attr[4]).replace(/&amp;/g, '&');
    }
    const tag = match[1].toLowerCase();
    const url = tag === 'link' ? attrs.href : tag === 'meta' ?
      (attrs.name === 'msapplication-TileImage' ? attrs.content : undefined) : attrs.src;
    if (url !== undefined) reference(file, url, root);
  }
  let inline = 0;
  for (const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!/\bsrc\s*=/i.test(match[1]) && match[2].trim()) syntax(`${file}:inline-${++inline}`, match[2]);
  }
  for (const match of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) css(file, match[1], root);
}

function nonemptyArray(value, label) {
  if (!Array.isArray(value) || !value.length) throw new Error(`${label}: expected a nonempty array`);
  return value;
}

function report() {
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Static validation passed: ${references} local asset references; ${scripts} JavaScript files/inline blocks parsed.`);
  }
}

// Each checked-in web release has its own asset root. The root manifest also
// covers debug output when present. Templates are not deployed entrypoints.
const manifests = [...tracked].filter(file => file === 'manifest.json' || /^bin-release\/web\/[^/]+\/manifest\.json$/.test(file));
if (!manifests.includes('manifest.json')) throw new Error('Missing root manifest.json');
for (const manifest of manifests) {
  const root = path.dirname(manifest);
  const index = reference(manifest, 'index.html', root);
  if (index) html(index, root);
  const data = json(manifest);
  for (const key of ['initial', 'game']) {
    for (const url of nonemptyArray(data[key], `${manifest}:${key}`)) reference(manifest, url, root);
  }
  const catalog = reference(manifest, 'resource/default.res.json', root);
  if (!catalog) continue;
  const resources = nonemptyArray(json(catalog).resources, `${catalog}:resources`);
  for (const resource of resources) {
    const asset = reference(catalog, resource.url, root);
    // Egret font and sprite-sheet descriptors resolve their image beside them.
    if (asset && ['font', 'sheet'].includes(resource.type)) {
      reference(asset, json(asset).file, root);
    }
  }
}
for (const file of tracked) {
  if (file.endsWith('.js')) syntax(file);
}
report();
