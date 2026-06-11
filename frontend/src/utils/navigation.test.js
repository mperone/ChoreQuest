import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_NAV_PATHS,
  fallbackBackPath,
  isTopLevelPath,
  shouldShowBackButton,
} from './navigation.js';

const NAV_PATHS = DEFAULT_NAV_PATHS;

test('primary navigation no longer includes the retired party hub', () => {
  assert.deepEqual(NAV_PATHS, ['/', '/chores', '/leaderboard', '/rewards', '/calendar']);
  assert.equal(NAV_PATHS.includes('/party'), false);
});

test('top-level navigation routes do not need a back button', () => {
  assert.equal(isTopLevelPath('/', NAV_PATHS), true);
  assert.equal(isTopLevelPath('/chores', NAV_PATHS), true);
  assert.equal(isTopLevelPath('/leaderboard', NAV_PATHS), true);
  assert.equal(isTopLevelPath('/calendar', NAV_PATHS), true);
  assert.equal(shouldShowBackButton('/rewards', NAV_PATHS), false);
});

test('detail and utility routes use the global back button', () => {
  assert.equal(shouldShowBackButton('/chores/12', NAV_PATHS), true);
  assert.equal(shouldShowBackButton('/kids/4', NAV_PATHS), true);
  assert.equal(shouldShowBackButton('/profile', NAV_PATHS), true);
});

test('quest detail deep links fall back to the quest board', () => {
  assert.equal(fallbackBackPath('/chores/12'), '/chores');
});

test('secondary routes have stable fallback destinations', () => {
  assert.equal(fallbackBackPath('/kids/4'), '/');
  assert.equal(fallbackBackPath('/avatar'), '/profile');
  assert.equal(fallbackBackPath('/settings'), '/profile');
  assert.equal(fallbackBackPath('/profile'), '/');
  assert.equal(fallbackBackPath('/admin'), '/profile');
});
