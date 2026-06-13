import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';


const app = express();
const port = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    transport: WebSocket,
  },
});
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'hospital-service' });
});

app.get('/hospitals', async (req, res) => {
  const { city, specialty } = req.query;

  let query = supabase
    .from('hospitals')
    .select('*, doctors(*)');

  if (city) query = query.eq('city', city as string);
  if (specialty) query = query.contains('specialty_tags', [specialty as string]);

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});

app.listen(port, () => {
  console.log(`Hospital service listening on port ${port}`);
});
