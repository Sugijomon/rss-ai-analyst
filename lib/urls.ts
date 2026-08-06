const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'source',
]);

function unwrapGoogleRedirect(url: URL): URL {
  if (!url.hostname.endsWith('google.com') || url.pathname !== '/url') {
    return url;
  }

  const destination = url.searchParams.get('url') || url.searchParams.get('q');
  if (!destination) {
    return url;
  }

  try {
    return new URL(destination);
  } catch {
    return url;
  }
}

export function canonicalizeArticleUrl(value: string): string {
  try {
    const url = unwrapGoogleRedirect(new URL(value.trim()));
    url.hash = '';

    for (const key of Array.from(url.searchParams.keys())) {
      if (key.startsWith('utm_') || TRACKING_PARAMS.has(key)) {
        url.searchParams.delete(key);
      }
    }

    if (url.pathname !== '/') {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }

    return url.toString();
  } catch {
    return value.trim();
  }
}
