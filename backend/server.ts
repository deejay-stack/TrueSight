import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import classRoutes from './routes/classes.js';
import { getModelHealth, startInferenceWorker, stopInferenceWorker } from './services/InferenceService.js';

dotenv.config();

const app = express();

const configuredClientUrls = (process.env.CLIENT_URL ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
const allowedOrigins = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...configuredClientUrls,
]);
const isLocalDevelopmentOrigin = (origin: string) =>
    process.env.NODE_ENV !== 'production' &&
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin) || isLocalDevelopmentOrigin(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true
}));
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.get('/health', (_req, res) => {
    const health = getModelHealth();
    res.status(health.status === 'ok' ? 200 : 503).json(health);
});

app.use('/api/auth', authRoutes);
app.use('/api/classes', classRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startInferenceWorker().catch((error) => {
        console.warn(`[ai-model] Startup failed: ${error.message}`);
    });
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => { stopInferenceWorker(); process.exit(0); });
}
