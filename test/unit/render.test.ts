import { expect, it } from 'vitest';
import { RENDER_NAME } from '../../src/render/index.js';

it('render skeleton exports RENDER_NAME', () => {
  expect(RENDER_NAME).toBeDefined();
});
