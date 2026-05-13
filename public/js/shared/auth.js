/**
 * Check that the user has stored credentials/session. Redirects to login
 * if not. Returns true when the page may proceed, false when a redirect
 * has been issued.
 */
export async function checkAndRefreshAuth() {
  const credentials = sessionStorage.getItem("av_credentials");
  const session = sessionStorage.getItem("av_session");

  if (!credentials || !session) {
    const currentPath = window.location.pathname + window.location.search;
    const returnUrl = encodeURIComponent(currentPath);
    window.location.href = `/login.html?return_url=${returnUrl}`;
    return false;
  }

  return true;
}
