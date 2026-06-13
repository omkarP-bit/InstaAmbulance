import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { SignJWT, jwtVerify } from 'jose';
import WebSocket from 'ws';


const app = express();
const port = process.env.PORT || 3002;

app.use(helmet());
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  realtime: {
    transport: WebSocket,
  },
});
const secretString = process.env.NEXTAUTH_SECRET || "fallback-secret-for-signing-tokens-that-is-at-least-32-chars";
const SECRET = new TextEncoder().encode(secretString);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service' });
});

app.post('/auth/login', async (req, res) => {
  const { email, name, role, hospitalCode, password } = req.body;

  if (role === 'receptionist') {
    const { data: hospital } = await supabase
      .from('hospitals')
      .select('id, name')
      .eq('id', hospitalCode)
      .single();

    if (hospital && password === "admin123") {
      const jwt = await new SignJWT({ id: hospital.id, name: hospital.name, role: 'receptionist', hospitalId: hospital.id })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h')
        .sign(SECRET);

      return res.json({ token: jwt, user: { id: hospital.id, name: hospital.name, role: 'receptionist' } });
    }
    return res.status(401).json({ error: 'Invalid credentials' });
  } else {
    // Patient login (simplified for hackathon, assuming email/name comes from some frontend oauth flow)
    const { data: existingPatient } = await supabase
      .from("patients")
      .select("id")
      .eq("email", email)
      .single();

    let patientId = existingPatient?.id;

    if (!existingPatient) {
      const { data: newPatient } = await supabase.from("patients").insert({ email, name }).select().single();
      patientId = newPatient?.id;
    }

    const jwt = await new SignJWT({ id: patientId, email, name, role: 'patient' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(SECRET);

    return res.json({ token: jwt, user: { id: patientId, email, name, role: 'patient' } });
  }
});

app.post('/auth/verify', async (req, res) => {
  const { token } = req.body;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    res.json({ valid: true, payload });
  } catch (error) {
    res.status(401).json({ valid: false });
  }
});

app.listen(port, () => {
  console.log(`Auth service listening on port ${port}`);
});
