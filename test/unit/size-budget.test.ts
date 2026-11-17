import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { CLIENT_JS, STYLES_CSS, TEMPLATE_HTML } from '../../src/render/assets.generated.js';

/** Spec 08 §4: the gzipped template, client script and styles stay within 60 KB. */
const BUDGET = 60 * 1024;

describe('size budget', () => {
  it('template + client + styles gzip to 60 KB or less', () => {
    const gz = gzipSync(Buffer.from(TEMPLATE_HTML + CLIENT_JS + STYLES_CSS), { level: 9 }).length;
    // Print it so a CI log shows the trend before the budget is reached.
    console.log(`size budget: ${(gz / 1024).toFixed(1)} KB of ${BUDGET / 1024} KB gzipped`);
    expect(gz).toBeLessThanOrEqual(BUDGET);
  });
  it('the client is a single script with no external references', () => {
    expect(CLIENT_JS).not.toMatch(/https?:\/\/(?!www\.w3\.org)[^"'\s]*\.(js|css)/);
    expect(STYLES_CSS).not.toMatch(/@import|url\(\s*['"]?https?:/);
    expect(TEMPLATE_HTML).not.toMatch(/<(link|img|iframe)\b/);
  });
});
