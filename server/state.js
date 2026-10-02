/** Sign-in codes and rate limits for a single local process. Hosted deployments use createRedisState. */
export function createMemoryState() {
  const codes = new Map();
  const tries = new Map();
  const hits = new Map();

  return {
    async getCode(email) {
      return codes.get(email) ?? null;
    },
    async putCode(email, record) {
      codes.set(email, record);
      tries.delete(email);
    },
    async dropCode(email) {
      codes.delete(email);
      tries.delete(email);
    },
    async countTry(email) {
      const count = (tries.get(email) ?? 0) + 1;
      tries.set(email, count);
      return count;
    },
    async countHit(ip, windowMs, now) {
      const bucket = Math.floor(now / windowMs);
      const entry = hits.get(ip);
      const count = entry?.bucket === bucket ? entry.count + 1 : 1;
      hits.set(ip, { bucket, count });
      return count;
    },
  };
}
