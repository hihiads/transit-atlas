const url = new URL(window.location.href);
const actionPaths = ['/verify-email', '/reset-password', '/confirm-parent'];

function readActionToken() {
  if (!actionPaths.includes(url.pathname)) return '';
  const fragment = new URLSearchParams(url.hash.slice(1));
  const token = fragment.get('token') || url.searchParams.get('token') || '';
  if (fragment.has('token') || url.searchParams.has('token')) {
    fragment.delete('token');
    url.hash = fragment.toString();
    url.searchParams.delete('token');
    window.history.replaceState(window.history.state, '', url.href);
  }
  return token;
}

export const actionLinkToken = readActionToken();
