export const DEFAULT_NAV_PATHS = ['/', '/chores', '/leaderboard', '/rewards', '/calendar'];

function normalizePath(pathname) {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

export function isTopLevelPath(pathname, navPaths) {
  const path = normalizePath(pathname);
  return navPaths.some((navPath) => normalizePath(navPath) === path);
}

export function shouldShowBackButton(pathname, navPaths) {
  return !isTopLevelPath(pathname, navPaths);
}

export function fallbackBackPath(pathname) {
  const path = normalizePath(pathname);
  if (path.startsWith('/chores/')) return '/chores';
  if (path.startsWith('/kids/')) return '/';
  if (path === '/avatar') return '/profile';
  if (path === '/settings') return '/profile';
  if (path === '/admin') return '/profile';
  return '/';
}
