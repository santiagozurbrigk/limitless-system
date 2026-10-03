import { reportarErrorDelBot } from "./sentry";

export function log(message: string, ...args: unknown[]) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${message}`, ...args);
}

export function logError(message: string, ...args: unknown[]) {
  const ts = new Date().toISOString();
  console.error(`[${ts}] ${message}`, ...args);
  const error = args.find((arg) => arg instanceof Error);
  reportarErrorDelBot(error ?? new Error(message), message);
}
