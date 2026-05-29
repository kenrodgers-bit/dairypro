import NodeCache from 'node-cache';

export const dashboardCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

export function getDashboardCacheKey(req) {
  return `dashboard:${req.user.farm}:${req.user._id}`;
}

export function invalidateDashboardCache(farmId) {
  const farmKey = `dashboard:${farmId}:`;
  const keys = dashboardCache.keys().filter((key) => key.startsWith(farmKey));

  if (keys.length) {
    dashboardCache.del(keys);
  }
}
