import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('le client utilise une API versionnée', async () => {
  const source = await readFile(new URL('../src/api.ts', import.meta.url), 'utf8');
  assert.match(source, /fetch\(`\/api\/v1\$\{path\}`/);
});

test('la fiche entretien reste visible à l’impression', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(styles, /\.dashboard\s*>\s*:not\(\.communications\)/);
  assert.match(styles, /body:has\(\.communications\) \.communications/);
  assert.match(styles, /visibility:\s*visible/);
});
