#!/usr/bin/env node
/*
  check.js - runs the static audit and the runtime probes together, and
  says what has changed since the last time.

    node check.js index.html sw.js manifest.json
    node check.js index.html --save            record this as the baseline
    node check.js index.html --quiet           only what is wrong or changed

  A single run tells you the state of a file. Over a project's life the
  more useful question is what moved: a warning that appeared, coverage
  that slipped, a probe that used to pass. That needs something to compare
  against, so the results are written to .checkbaseline.json and every
  later run is read against it.

  Exit code: 0 clean and nothing worse than before
             1 warnings only
             2 a fault, or anything got worse
*/

'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const BASELINE = '.checkbaseline.json';

function runTool(script, args) {
  const file = path.join(HERE, script);
  if (!fs.existsSync(file)) return { missing: script };
  try {
    const out = execFileSync(process.execPath, [file, ...args, '--json'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return { ok: true, data: JSON.parse(out) };
  } catch (e) {
    /* both tools exit non-zero when they find something, which is not an
       error in itself - the output still matters */
    const text = (e.stdout || '').toString();
    try { return { ok: true, data: JSON.parse(text) }; }
    catch (e2) { return { failed: (e.stderr || e.message || '').toString().slice(0, 300) }; }
  }
}

function collect(files) {
  const findings = [];

  const audit = runTool('audit.js', files);
  if (audit.missing) findings.push({ src: 'audit', level: 'note', key: 'audit.js not alongside', detail: '' });
  else if (audit.failed) findings.push({ src: 'audit', level: 'fault', key: 'the audit could not run', detail: audit.failed });
  else for (const f of audit.data) {
    findings.push({ src: 'audit', level: f.level, key: f.layer + ' / ' + f.check, detail: f.detail, evidence: f.evidence });
  }

  const probe = runTool('probe.js', [files[0]]);
  if (probe.missing) findings.push({ src: 'probe', level: 'note', key: 'probe.js not alongside', detail: '' });
  else if (probe.failed) findings.push({ src: 'probe', level: 'fault', key: 'the probes could not run', detail: probe.failed });
  else for (const [tag, name, detail] of probe.data) {
    findings.push({
      src: 'probe',
      level: tag.trim() === 'FAIL' ? 'fault' : (tag.trim() === 'thin' ? 'warn' : 'note'),
      /* the key has its numbers taken out so it compares across runs, but
         those numbers are the measurements, so keep the original too */
      key: 'runtime / ' + name.replace(/\d+/g, 'N'),
      raw: name,
      detail: detail || '',
      evidence: null
    });
  }

  return findings;
}

/* A number buried in a line of prose is the thing worth watching over
   time, so pull the ones that mean something out. */
function measures(findings) {
  const m = {};
  for (const f of findings) {
    const cov = ((f.raw || f.key) + ' ' + f.detail).match(/(\d+) of (\d+) methods reached/);
    if (cov) { m.methodsReached = Number(cov[1]); m.methodsTotal = Number(cov[2]); }
    const scan = f.detail.match(/(\d+)% of the script read as code/);
    if (scan) m.sourceRead = Number(scan[1]);
  }
  m.faults = findings.filter(f => f.level === 'fault').length;
  m.warnings = findings.filter(f => f.level === 'warn').length;
  return m;
}

function compare(now, before) {
  if (!before) return null;
  const key = f => f.src + '|' + f.key;
  const wasBad = new Map(before.findings.filter(f => f.level !== 'note').map(f => [key(f), f]));
  const isBad = new Map(now.findings.filter(f => f.level !== 'note').map(f => [key(f), f]));

  const appeared = [...isBad.values()].filter(f => !wasBad.has(key(f)));
  const resolved = [...wasBad.values()].filter(f => !isBad.has(key(f)));

  const drift = [];
  const a = now.measures, b = before.measures;
  if (a.methodsReached != null && b.methodsReached != null) {
    const pa = Math.round(a.methodsReached / a.methodsTotal * 100);
    const pb = Math.round(b.methodsReached / b.methodsTotal * 100);
    if (pa < pb - 1) drift.push(`coverage fell from ${pb}% to ${pa}%`);
    else if (pa > pb + 1) drift.push(`coverage rose from ${pb}% to ${pa}%`);
  }
  if (a.sourceRead != null && b.sourceRead != null && a.sourceRead < b.sourceRead - 5) {
    drift.push(`less of the source could be read than before, ${b.sourceRead}% to ${a.sourceRead}%`);
  }
  return { appeared, resolved, drift, before: b, now: a };
}

/* ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const files = argv.filter(a => a[0] !== '-');
if (!files.length) { console.error('give me the html file, and optionally the worker and manifest'); process.exit(2); }
const quiet = argv.includes('--quiet');
const save = argv.includes('--save');

const findings = collect(files);
const now = { when: new Date().toISOString(), files, findings, measures: measures(findings) };

const dir = path.dirname(path.resolve(files[0]));
const baselinePath = path.join(dir, BASELINE);
let before = null;
if (fs.existsSync(baselinePath)) {
  try { before = JSON.parse(fs.readFileSync(baselinePath, 'utf8')); } catch (e) {}
}
const diff = compare(now, before);

console.log('\n  ' + files.map(f => path.basename(f)).join('  '));

const faults = findings.filter(f => f.level === 'fault');
const warns = findings.filter(f => f.level === 'warn');

for (const f of faults.concat(warns)) {
  console.log('    ' + (f.level === 'fault' ? 'FAULT' : 'warn ') + '  ' + f.key + (f.detail ? ' — ' + f.detail : ''));
  if (f.evidence) console.log('             ' + String(f.evidence).slice(0, 140));
}
if (!faults.length && !warns.length) console.log('    nothing wrong');

if (diff) {
  console.log('\n  since ' + before.when.slice(0, 16).replace('T', ' '));
  if (diff.appeared.length) {
    for (const f of diff.appeared) console.log('    NEW      ' + f.key + (f.detail ? ' — ' + f.detail.slice(0, 80) : ''));
  }
  if (diff.resolved.length) {
    for (const f of diff.resolved) console.log('    fixed    ' + f.key);
  }
  for (const d of diff.drift) console.log('    ' + (d.includes('fell') || d.includes('less') ? 'WORSE    ' : 'better   ') + d);
  if (!diff.appeared.length && !diff.resolved.length && !diff.drift.length) console.log('    no change');
} else {
  console.log('\n  no baseline yet — run with --save to record this one');
}

const m = now.measures;
console.log('\n  ' + m.faults + ' fault' + (m.faults === 1 ? '' : 's') +
  ', ' + m.warnings + ' warning' + (m.warnings === 1 ? '' : 's') +
  (m.methodsReached != null ? ', ' + Math.round(m.methodsReached / m.methodsTotal * 100) + '% of methods reached' : '') + '\n');

if (save) {
  fs.writeFileSync(baselinePath, JSON.stringify(now, null, 1));
  console.log('  recorded as the baseline\n');
}

const worse = diff && (diff.appeared.length || diff.drift.some(d => d.includes('fell') || d.includes('less')));
process.exit(m.faults || worse ? 2 : (m.warnings ? 1 : 0));
