import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtmlText, escapeHtmlAttribute } from '../../web/shared/js/core/html-escape.js';
import { emptyStateHtml } from '../../web/shared/js/core/empty-state.js';

test('HTML text and quoted attributes encode all template delimiters', () => {
  const unsafe = `<img src='x' onerror="alert(1)">&`;
  const escaped = '&lt;img src=&#39;x&#39; onerror=&quot;alert(1)&quot;&gt;&amp;';
  assert.equal(escapeHtmlText(unsafe), escaped);
  assert.equal(escapeHtmlAttribute(unsafe), escaped);
  assert.equal(escapeHtmlText(null), '');
  assert.equal(escapeHtmlAttribute(42), '42');
  assert.equal(emptyStateHtml(unsafe), `<div class="empty-state">${escaped}</div>`);
});
