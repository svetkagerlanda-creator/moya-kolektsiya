#!/usr/bin/env node
// Read-only catalog integrity audit. Run: node scripts/audit-catalogs.cjs
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'catalogs');
const findings = [];
const stats = { files: 0, series: 0, items: 0, photos: 0, sourceUrls: 0 };
const identities = new Map();
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'progress') walk(full); }
    else if (entry.name.endsWith('.json')) inspect(full);
  }
}
function report(level, file, series, detail) { findings.push({ level, file, series, detail }); }
function inspect(full) {
  const file = path.relative(root, full).replace(/\\/g, '/');
  let data;
  try { data = JSON.parse(fs.readFileSync(full, 'utf8')); }
  catch (e) { report('error', file, '', 'Invalid JSON: ' + e.message); return; }
  const groups = Array.isArray(data) ? data : Array.isArray(data.series) ? data.series : null;
  if (!groups) return; // Other JSON metadata is not a series catalog.
  stats.files++;
  for (const series of groups) {
    if (!series || !Array.isArray(series.items)) { report('warning', file, series?.name || '', 'No items array'); continue; }
    stats.series++;
    const title = String(series.name || '');
    if (!series.items.length) report('warning', file, title, 'Empty series');
    if (Number.isInteger(series.count) && series.count !== series.items.length)
      report('error', file, title, 'Declared count ' + series.count + ' != ' + series.items.length);
    const generation = (title + ' ' + (series.group || '')).toLowerCase();
    if (/g4\.5|generation 4\.5/.test(generation) && /(?:^|[^\d])g4(?:[^\d.]|$)/.test(generation.replace(/g4\.5/g, '')))
      report('warning', file, title, 'Possible mixed G4 and G4.5 labels; manually review');
    for (const item of series.items) {
      stats.items++;
      if (item.photo) stats.photos++;
      if (item.sourceUrl) stats.sourceUrls++;
      for (const key of ['photo', 'sourceUrl']) {
        if (!item[key]) report('warning', file, title, 'Missing ' + key + ': ' + (item.name || '?'));
        else if (!/^https:\/\//i.test(item[key])) report('error', file, title, 'Non-HTTPS ' + key + ': ' + (item.name || '?'));
      }
      const sku = item.productSku || item.sku || item.figureNumber || '';
      const variant = item.variantKey || item.variant || item.catalogPosition || '';
      const identity = [series.manufacturer || item.manufacturer || '', title, sku, variant].join('|').toLowerCase();
      if (sku && identities.has(identity)) report('warning', file, title, 'Possible duplicate identity: ' + (item.name || '?') + ' (also ' + identities.get(identity) + ')');
      else if (sku) identities.set(identity, file);
    }
  }
}
walk(root);
const result = { auditedAt: new Date().toISOString(), scope: 'catalogs/**/*.json excluding progress; local structural checks only', stats, findings };
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
if (findings.some(f => f.level === 'error')) process.exitCode = 1;
