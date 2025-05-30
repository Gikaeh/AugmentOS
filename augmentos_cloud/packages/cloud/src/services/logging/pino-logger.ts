import pino from 'pino';
import { posthog } from './posthog.service';
import { pinoPostHogTransport } from './transports/PostHogTransport';

// Constants and configuration
const BETTERSTACK_SOURCE_TOKEN = process.env.BETTERSTACK_SOURCE_TOKEN;
const BETTERSTACK_ENDPOINT = process.env.BETTERSTACK_ENDPOINT || 'https://s1311181.eu-nbg-2.betterstackdata.com';
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORTER_APP_NAME = process.env.PORTER_APP_NAME || 'cloud-local';

// Determine log level based on environment
const LOG_LEVEL = NODE_ENV === 'production' ? 'info' : 'debug';

// Setup streams array for Pino multistream
const streams: pino.StreamEntry[] = [];

// Use pretty print in development for better readability
// if (PRETTY_PRINT && NODE_ENV !== 'production') {
// Pretty transport for development
const prettyTransport = pino.transport({
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'SYS:standard',
    // translateTime: 'mm/dd/yyyy, hh:MM:ss TT',
    ignore: 'pid,hostname,env,module,server',
    messageFormat: '{msg}',
    errorProps: '*',
    customPrettifiers: {
      // Add custom prettifiers here if needed
    }
  }
});

streams.push({
  stream: prettyTransport,
  level: LOG_LEVEL,
});
// } else {
//   // Plain console in production (JSON format)
//   streams.push({
//     stream: process.stdout,
//     level: LOG_LEVEL,
//   });
// }

// Add BetterStack transport if token is provided
if (BETTERSTACK_SOURCE_TOKEN) {
  const betterStackTransport = pino.transport({
    target: '@logtail/pino',
    options: {
      sourceToken: BETTERSTACK_SOURCE_TOKEN,
      options: { endpoint: BETTERSTACK_ENDPOINT },
    },
  });

  streams.push({
    stream: betterStackTransport,
    level: LOG_LEVEL,
  });
}

// Add PostHog stream for warnings and errors
streams.push({
  stream: {
    write: (line: string) => {
      pinoPostHogTransport.write(line, () => { });
    }
  },
  level: 'warn', // Only process warnings and errors
});

// Create multistream
const multistream = pino.multistream(streams);

/**
 * Configuration for the root logger
 */
const baseLoggerOptions: pino.LoggerOptions = {
  level: LOG_LEVEL,
  base: {
    env: NODE_ENV,
    server: PORTER_APP_NAME,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

// Create the root logger with multiple streams
export const logger = pino(baseLoggerOptions, multistream);

/**
 * Track exceptions in PostHog
 * @param error The error object
 * @param context Additional context
 */
export function trackException(error: Error, context: Record<string, any> = {}) {
  if (posthog) {
    const distinctId = context.userId || context.sessionId || 'system';

    posthog.captureException({
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...context
    }, distinctId, context);
  }
}

// Flush logger on process exit
// process.on('beforeExit', async () => {
//   logger.flush(); // Flush the root logger
//   console.log('Logger flushed before exit');
// });

// Or just remove the signal handlers entirely in development
let isExiting = false;

const gracefulShutdown = async (signal: string) => {
  if (isExiting) return;
  isExiting = true;

  logger.warn(`Received ${signal}, shutting down gracefully...`);
  
  // Quick flush and exit
  try {
    logger.flush();
  } catch (error) {
    // Ignore flush errors
  }
  
  process.exit(0);
};

// Only handle beforeExit (for crashes) and uncaught exceptions
// process.on('beforeExit', () => gracefulShutdown('beforeExit'));
// process.on('uncaughtException', (error) => {
//   logger.error(error, 'Uncaught Exception');
//   process.exit(1);
// });

// Let Bun handle SIGTERM/SIGINT for file watching

// Default export is the logger
export default logger;