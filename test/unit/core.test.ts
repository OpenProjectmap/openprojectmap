import { expect, it } from 'vitest';
import { CORE_NAME } from '../../src/core/index.js';

it('core skeleton exports CORE_NAME', () => {
  expect(CORE_NAME).toBeDefined();
});
