import pino from 'pino';
import { loadConfig } from '../config';

const config = loadConfig();

export const logger = pino({
  level: config.logLevel,
  transport: config.logLevel === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
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
