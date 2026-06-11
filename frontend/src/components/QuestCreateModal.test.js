import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'QuestCreateModal.jsx');
const source = readFileSync(sourcePath, 'utf8');

test('quest create modal no longer exposes built-in quest templates', () => {
  assert.equal(source.includes('/api/chores/templates'), false);
  assert.equal(source.includes('Choose from Quest Templates'), false);
  assert.equal(source.includes('No templates available yet.'), false);
});
