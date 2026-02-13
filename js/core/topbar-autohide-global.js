import { initMobileTopbarAutohide } from './topbar-autohide.js';

const path = location.pathname.toLowerCase();
const file = path.split('/').pop() || '';

const isExcluded =
  path.includes('/base-explorer/') ||
  path.includes('/logo-editor/') ||
  path.includes('/control/') ||
  file === 'base-explorer.html' ||
  file === 'logo-editor.html' ||
  file === 'control.html';

if (!isExcluded) {
  initMobileTopbarAutohide({ disabledIfHasSelector: '' });
}
