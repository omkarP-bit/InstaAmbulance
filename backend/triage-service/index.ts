import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
const port = process.env.PORT || 3004;

app.use(helmet());
app.use(cors());
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'triage-service' });
});

app.post('/triage', async (req, res) => {
  try {
    const { symptoms } = req.body;

    const prompt = `
      You are a medical triage assistant. Analyze the following symptoms and classify the priority as "routine", "urgent", or "emergency".
      
      Symptoms: "${symptoms}"
      
      Return ONLY a JSON object in this format:
      {
        "priority": "routine" | "urgent" | "emergency",
        "reason": "Max 12 words explanation",
        "estimated_consult_minutes": number
      }
    `;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY || ""}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data: any = await response.json();
    const content = data.choices[0].message.content;
    const result = JSON.parse(content.substring(content.indexOf('{'), content.lastIndexOf('}') + 1));

    res.json(result);
  } catch (error: any) {
    console.error("Triage Error:", error);
    res.json({
      priority: "routine",
      reason: "Automated triage fallback due to processing error.",
      estimated_consult_minutes: 15
    });
  }
});

app.listen(port, () => {
  console.log(`Triage service listening on port ${port}`);
});
