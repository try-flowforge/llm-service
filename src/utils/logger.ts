import pino from 'pino';
import { loadConfig } from '../config';

const config = loadConfig();

export const logger = pino({
  base: null,
  level: config.logLevel,
  transport: config.logLevel === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      }
    : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
