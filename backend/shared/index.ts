import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

let redis: Redis;

try {
  // TC-014: Elasticache Support - Some clusters require TLS (rediss://)
  redis = new Redis(redisUrl, {
    tls: redisUrl.startsWith('rediss://') ? {} : undefined,
    retryStrategy: (times) => Math.min(times * 50, 2000),
  });
  redis.on('error', (err: any) => console.error('Redis connection error:', err));
} catch (error) {
  console.error('Failed to initialize Redis:', error);
  redis = {} as any;
}

export { redis };
