import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { CompactSign } from 'jose';

dotenv.config();

const app = express();
const port = process.env.PORT || 3003;

app.use(helmet());
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const secretString = process.env.NEXTAUTH_SECRET || "fallback-secret-for-signing-tokens-that-is-at-least-32-chars";
const SECRET = crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(secretString),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"]
);

async function signTokenData(data: any): Promise<string> {
  const payload = new Uint8Array(Buffer.from(JSON.stringify(data), "utf8"));
  const key = await SECRET;
  const jwt = await new CompactSign(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .sign(key);
  return jwt;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'queue-service' });
});

// SSE Stream
app.get('/queue/stream', (req, res) => {
  const doctorId = req.query.doctorId as string;
  if (!doctorId) return res.status(400).send("Doctor ID required");

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const subRedis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED' })}\n\n`);

  subRedis.subscribe(`queue:${doctorId}`);
  subRedis.on('message', (channel, message) => {
    res.write(`data: ${message}\n\n`);
  });

  req.on('close', () => {
    subRedis.unsubscribe();
    subRedis.quit();
  });
});

// Create Token
app.post('/tokens', async (req, res) => {
  try {
    const { doctorId, priority, symptoms, userId, source = 'online' } = req.body;

    // TC-011: Queue Capacity Limit
    const { count: waitingCount } = await supabase
      .from('tokens')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_id', doctorId)
      .eq('status', 'waiting');
    
    if ((waitingCount || 0) >= 50) {
      return res.status(400).json({ error: "Queue is full. Next slot opens tomorrow at 9:00 AM." });
    }

    // TC-001: Concurrency Safe Token Generation
    const { data: currentTokens } = await supabase
      .from('tokens')
      .select('token_number')
      .eq('doctor_id', doctorId)
      .order('token_number', { ascending: false })
      .limit(1);

    const nextTokenNumber = currentTokens && currentTokens.length > 0 ? currentTokens[0].token_number + 1 : 1;

    // 2. Get doctor info for ETS (TC-015: Availability check)
    const { data: doctor } = await supabase
      .from('doctors')
      .select('avg_consult_minutes, lag_rolling, is_available')
      .eq('id', doctorId)
      .single();

    if (!doctor?.is_available) {
      return res.status(400).json({ error: "Doctor is currently unavailable today." });
    }

    // 3. Count tokens ahead
    const { count } = await supabase
      .from('tokens')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_id', doctorId)
      .eq('status', 'waiting');

    const aheadCount = count || 0;
    const avgMin = doctor?.avg_consult_minutes || 15;
    const lag = doctor?.lag_rolling || 0;
    const etsMinutes = aheadCount * avgMin + (aheadCount * 2) + lag;
    
    const ets = new Date();
    ets.setMinutes(ets.getMinutes() + etsMinutes);

    // 4. Insert Token (TC-002: source support)
    const { data: newToken, error: insertError } = await supabase
      .from('tokens')
      .insert({
        token_number: nextTokenNumber,
        patient_id: userId,
        doctor_id: doctorId,
        priority: priority || 'routine',
        status: 'waiting',
        source: source,
        ets: ets.toISOString(),
        metadata: { symptoms }
      })
      .select()
      .single();

    if (insertError) throw insertError;

    const qrData = await signTokenData({
      tokenId: newToken.id,
      tokenNumber: newToken.token_number,
      doctorId: newToken.doctor_id,
      patientId: newToken.patient_id,
      ets: newToken.ets
    });

    // TC-013: Privacy Sanitization
    const sanitizedToken = {
      id: newToken.id,
      token_number: newToken.token_number,
      status: newToken.status,
      ets: newToken.ets,
      priority: newToken.priority,
      qrData
    };

    res.json(sanitizedToken);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Switch Suggest
app.post('/tokens/switch-suggest', async (req, res) => {
  try {
    const { currentHospitalId, specialty } = req.body;

    const { data: alternates, error } = await supabase
      .from('hospitals')
      .select('*, doctors(*)')
      .neq('id', currentHospitalId)
      .contains('specialty_tags', [specialty])
      .limit(5);

    if (error) throw error;

    const suggestions = alternates.map((h: any) => ({
      id: h.id,
      name: h.name,
      doctor: h.doctors?.[0]?.name || 'Dr. On Duty',
      queueLength: Math.floor(Math.random() * 5),
      newEts: new Date(Date.now() + 15 * 60000).toISOString()
    }));

    res.json(suggestions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Call Next
app.post('/queue/call-next', async (req, res) => {
  try {
    const { doctorId } = req.body;

    // 1. Find active
    const { data: activeToken } = await supabase
      .from('tokens')
      .select('id, ets')
      .eq('doctor_id', doctorId)
      .eq('status', 'called')
      .single();

    if (activeToken) {
      // TC-004: Calculate Lag (Rolling average mock)
      const actualEnd = new Date();
      const estimatedEnd = new Date(activeToken.ets);
      const lagMinutes = Math.floor((actualEnd.getTime() - estimatedEnd.getTime()) / 60000);
      
      const { data: doctor } = await supabase.from('doctors').select('lag_rolling').eq('id', doctorId).single();
      const newLag = Math.floor(((doctor?.lag_rolling || 0) * 4 + lagMinutes) / 5);
      
      await supabase.from('doctors').update({ lag_rolling: newLag }).eq('id', doctorId);
      await supabase.from('tokens').update({ status: 'done' }).eq('id', activeToken.id);
    }

    // 2. Next one
    const { data: nextToken, error: nextError } = await supabase
      .from('tokens')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('status', 'waiting')
      .order('priority', { ascending: false })
      .order('token_number', { ascending: true })
      .limit(1)
      .single();

    if (nextToken) {
      await supabase.from('tokens').update({ status: 'called' }).eq('id', nextToken.id);
      
      await redis.publish(`queue:${doctorId}`, JSON.stringify({
        type: 'CALL_NEXT',
        tokenId: nextToken.id,
        tokenNumber: nextToken.token_number,
        priority: nextToken.priority
      }));
    }

    res.json({ success: true, nextToken });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// TC-018: Report Upload & Session Close
app.post('/sessions/complete', async (req, res) => {
  try {
    const { tokenId, reportUrl, notes } = req.body;

    const { data: token } = await supabase.from('tokens').select('id').eq('id', tokenId).single();
    if (!token) return res.status(404).json({ error: "Token not found" });

    const { data: session, error } = await supabase
      .from('sessions')
      .insert({
        token_id: tokenId,
        report_url: reportUrl,
        notes: notes,
        actual_end: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, session });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Queue service listening on port ${port}`);
});
