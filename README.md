# LLM Microservice

Internal microservice for AI workflow blocks. Provides unified access to OpenRouter and OpenAI with rate limiting, retries.

## Features

- **Multiple Providers**: OpenRouter (free models) + OpenAI (gpt-4o-mini)
- **Rate Limiting**: Per-user request limits
- **Concurrency Control**: Global concurrency limits
- **Retries**: Automatic retry with exponential backoff
- **JSON Validation**: AJV-based schema validation
- **Structured Logging**: Pino with request tracing
- **Health Checks**: `/health` and `/ready` endpoints

## Development

```bash
npm i

npm run build

npm run start
```

## Security

- Service-to-service authentication
- No API keys exposed to frontend
- Rate limiting per user
- Concurrency limits
- Request timeouts

## Error Codes

- `INVALID_REQUEST` - Missing/invalid parameters
- `MODEL_NOT_FOUND` - Model not in catalog
- `LLM_MODEL_NOT_CONFIGURED` - Placeholder model not configured
- `PROVIDER_NOT_CONFIGURED` - Missing provider API key
- `RATE_LIMIT_EXCEEDED` - User rate limit exceeded
- `CONCURRENCY_LIMIT_EXCEEDED` - Service concurrency limit
- `PROVIDER_ERROR` - Provider API error
- `PROVIDER_TIMEOUT` - Provider request timeout
- `JSON_VALIDATION_FAILED` - Response doesn't match schema
- `INTERNAL_ERROR` - Unknown error
