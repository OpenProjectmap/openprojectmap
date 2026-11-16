import { expect, it } from 'vitest';
import { NODE_NAME } from '../../src/node/index.js';

it('node skeleton exports NODE_NAME', () => {
  expect(NODE_NAME).toBeDefined();
});
