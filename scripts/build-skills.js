#!/usr/bin/env node
// Regenerates skills/docslit-author.md from the component manifest and the
// templates in src/skill-templates/. Run with `npm run skills`.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateAuthorSkill } from '../src/skill-gen.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'skills', 'docslit-author.md');
const next = generateAuthorSkill();
const prev = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, next);
console.log(prev === next ? 'skills/docslit-author.md is up to date' : 'Wrote skills/docslit-author.md');
