import { expect, it } from 'vitest';
import { CLIENT_NAME } from '../../src/render/client/index.js';

it('client skeleton exports CLIENT_NAME', () => {
  expect(CLIENT_NAME).toBeDefined();
});
