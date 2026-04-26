import type { Id, WavedashSDK } from '@wvdsh/sdk-js';
import { wavedashFromWindow } from './wavedashHost';

/**
 * Name of the board on Wavedash (create once via getOrCreate on first submit).
 * Change only if you create a differently named board in the dashboard.
 */
export const WAVEDASH_LEADERBOARD_NAME = 'machines-total-score';

/** LeaderboardSortOrder: higher scores rank better. */
const SORT_DESCENDING = 1;
/** LeaderboardDisplayType: plain number. */
const DISPLAY_NUMERIC = 0;

let cachedLeaderboardId: Id<'leaderboards'> | undefined;

async function resolveLeaderboardId(wd: WavedashSDK): Promise<Id<'leaderboards'> | null> {
  if (cachedLeaderboardId) {
    return cachedLeaderboardId;
  }
  const res = await wd.getOrCreateLeaderboard(
    WAVEDASH_LEADERBOARD_NAME,
    SORT_DESCENDING,
    DISPLAY_NUMERIC,
  );
  if (!res.success || !res.data?.id) {
    return null;
  }
  cachedLeaderboardId = res.data.id as Id<'leaderboards'>;
  return cachedLeaderboardId;
}

/**
 * Posts the run's total score (train travel + kills + goose). Higher is better.
 * Fire-and-forget; no-op when not running inside Wavedash.
 */
export function submitRunScoreToWavedash(totalScore: number): void {
  const wd = wavedashFromWindow();
  if (!wd) return;
  const score = Math.floor(totalScore);
  if (!Number.isFinite(score)) return;

  void (async () => {
    try {
      const id = await resolveLeaderboardId(wd);
      if (!id) return;
      await wd.uploadLeaderboardScore(id, score, true);
    } catch {
      // Optional cloud path; local / offline should not break the game.
    }
  })();
}
