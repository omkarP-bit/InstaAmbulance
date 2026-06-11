import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Only connect if not in a build environment
const redis = process.env.SKIP_REDIS_CONNECT === 'true'
  ? ({} as any)
  : new Redis(redisUrl);

export default redis;
