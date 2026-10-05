const POSTS_KEY = "desk:posts";
const PAGES_KEY = "desk:pages";

function storageFailed() {
  const error = new Error("storage_failed");
  error.status = 503;
  error.code = "storage_failed";
  return error;
}

/** Vercel's Upstash integration sets the KV_* names; a direct Upstash database uses UPSTASH_*. */
export function redisConfig(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || "";
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

export function createRedis({ url, token }, fetchImpl = fetch) {
  async function send(path, body) {
    let response;
    try {
      response = await fetchImpl(`${url}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw storageFailed();
    }
    const data = await response.json().catch(() => null);
    if (!response.ok || data == null) throw storageFailed();
    return data;
  }

  return {
    async run(...command) {
      const data = await send("", command);
      if (data.error) throw storageFailed();
      return data.result;
    },
    async batch(commands) {
      const data = await send("/pipeline", commands);
      if (!Array.isArray(data) || data.some((item) => item.error)) throw storageFailed();
      return data.map((item) => item.result);
    },
  };
}

export function createRedisState(redis) {
  const codeKey = (email) => `desk:otp:${email}`;
  const triesKey = (email) => `desk:otp-tries:${email}`;

  return {
    async getCode(email) {
      const raw = await redis.run("GET", codeKey(email));
      if (typeof raw !== "string") return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    async putCode(email, record, ttlMs) {
      await redis.batch([
        ["SET", codeKey(email), JSON.stringify(record), "PX", String(ttlMs)],
        ["DEL", triesKey(email)],
      ]);
    },
    async dropCode(email) {
      await redis.run("DEL", codeKey(email), triesKey(email));
    },
    async countTry(email, ttlMs) {
      const [count] = await redis.batch([
        ["INCR", triesKey(email)],
        ["PEXPIRE", triesKey(email), String(ttlMs)],
      ]);
      return Number(count);
    },
    async countHit(ip, windowMs, now) {
      const key = `desk:hits:${ip}:${Math.floor(now / windowMs)}`;
      const [count] = await redis.batch([
        ["INCR", key],
        ["PEXPIRE", key, String(windowMs)],
      ]);
      return Number(count);
    },
  };
}

export function createRedisPosts(redis) {
  return {
    async all() {
      const flat = await redis.run("HGETALL", POSTS_KEY);
      const posts = [];
      if (!Array.isArray(flat)) return posts;
      for (let i = 1; i < flat.length; i += 2) {
        try {
          posts.push(JSON.parse(flat[i]));
        } catch {
          /* skip a damaged entry rather than lose the rest */
        }
      }
      return posts;
    },
    async put(post) {
      await redis.run("HSET", POSTS_KEY, post.id, JSON.stringify(post));
    },
    async remove(id) {
      await redis.run("HDEL", POSTS_KEY, id);
    },
  };
}

function parseRecord(raw) {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function createRedisPages(redis) {
  return {
    async all() {
      const flat = await redis.run("HGETALL", PAGES_KEY);
      const records = [];
      if (!Array.isArray(flat)) return records;
      for (let i = 1; i < flat.length; i += 2) {
        const record = parseRecord(flat[i]);
        if (record) records.push(record);
      }
      return records;
    },
    async get(id) {
      return parseRecord(await redis.run("HGET", PAGES_KEY, id));
    },
    async put(record) {
      await redis.run("HSET", PAGES_KEY, record.id, JSON.stringify(record));
    },
    async remove(id) {
      await redis.run("HDEL", PAGES_KEY, id);
    },
  };
}
