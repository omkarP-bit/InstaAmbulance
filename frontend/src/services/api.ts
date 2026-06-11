const AUTH_URL = import.meta.env.VITE_AUTH_SERVICE_URL;
const HOSPITAL_URL = import.meta.env.VITE_HOSPITAL_SERVICE_URL;
const QUEUE_URL = import.meta.env.VITE_QUEUE_SERVICE_URL;
const TRIAGE_URL = import.meta.env.VITE_TRIAGE_SERVICE_URL;

export const authService = {
  login: async (data: any) => {
    const res = await fetch(`${AUTH_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  verify: async (token: string) => {
    const res = await fetch(`${AUTH_URL}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    return res.json();
  },
};

export const hospitalService = {
  getHospitals: async (params: { city?: string; specialty?: string } = {}) => {
    const query = new URLSearchParams(params as any).toString();
    const res = await fetch(`${HOSPITAL_URL}/hospitals?${query}`);
    return res.json();
  },
};

export const queueService = {
  createToken: async (data: any) => {
    const res = await fetch(`${QUEUE_URL}/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  callNext: async (doctorId: string) => {
    const res = await fetch(`${QUEUE_URL}/queue/call-next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doctorId }),
    });
    return res.json();
  },
  getStreamUrl: (doctorId: string) => `${QUEUE_URL}/queue/stream?doctorId=${doctorId}`,
};

export const triageService = {
  getTriage: async (symptoms: string) => {
    const res = await fetch(`${TRIAGE_URL}/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symptoms }),
    });
    return res.json();
  },
};
