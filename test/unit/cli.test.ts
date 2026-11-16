import { expect, it } from 'vitest';
import { main } from '../../src/cli/index.js';

it('cli skeleton exports main', () => {
  expect(main).toBeDefined();
});
