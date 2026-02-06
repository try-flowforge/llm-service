# FlowForge LLM Service

Microservice for AI workflow blocks. Provides OpenRouter and OpenAI with rate limiting, retries, JSON schema validation. Backend calls it for AI Transform nodes; API keys never touch the frontend.

## Project Structure

```bash
llm-service/
├── src/
│   ├── config/        # Load and validate config
│   ├── providers/     # OpenAI, OpenRouter
│   ├── services/      # Chat service
│   ├── types/         # Contracts, error codes
│   ├── utils/         # HMAC, rate limiter, concurrency
│   ├── server.ts      # Fastify server
│   └── index.ts       # Entry point
├── config/models.json
└── package.json
```

## Setup & Run

**Prerequisites:** Node.js 20+, `OPENROUTER_API_KEY` or `OPENAI_API_KEY`

```bash
npm install
cp .env.example .env
# Edit .env: HMAC_SECRET (must match backend), API keys (see Environment variables below)
```

```bash
npm run build && npm run start
```

Dev with hot reload: `npm run dev` — runs on port **3002**

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Development with watch |
| `npm run build` | Compile TypeScript |
| `npm run start` | Run production |
| `npm run lint` | ESLint |

## API

**Health (no auth):** `GET /health`, `GET /ready`

**Authenticated (HMAC: `x-timestamp`, `x-signature`):** `GET /v1/models`, `POST /v1/chat`

`POST /v1/chat` body: `provider` (openai | openrouter), `model`, `messages`, `temperature`, `maxOutputTokens`, `responseSchema`, `requestId`, `userId`.

## Environment variables

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `PORT` | Server port | 3002 |
| `HMAC_SECRET` | Shared secret with backend (required) | — |
| `OPENROUTER_API_KEY` | OpenRouter API key | — |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `CONNECT_TIMEOUT` | Connect timeout (ms) | 10000 |
| `REQUEST_TIMEOUT` | Request timeout (ms) | 1000000 |
| `RATE_LIMIT_PER_USER` | Per-user limit | 30 |
| `GLOBAL_CONCURRENCY` | Max concurrent requests | 10 |
| `MAX_RETRIES`, `RETRY_BACKOFF_MS` | Retry config | 2, 1000 |
| `LOG_LEVEL` | Logging level | info |

Backend must set `LLM_SERVICE_BASE_URL` and matching `HMAC_SECRET`.

## Error codes

`INVALID_REQUEST`, `MODEL_NOT_FOUND`, `LLM_MODEL_NOT_CONFIGURED`, `PROVIDER_NOT_CONFIGURED`, `RATE_LIMIT_EXCEEDED`, `CONCURRENCY_LIMIT_EXCEEDED`, `PROVIDER_ERROR`, `PROVIDER_TIMEOUT`, `JSON_VALIDATION_FAILED`, `INTERNAL_ERROR`

## LICENSE

[MIT License](LICENSE)
