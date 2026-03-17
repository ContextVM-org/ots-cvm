import type { AppConfig } from './config.ts';

export class AppLogger {
  public constructor(private readonly config: Pick<AppConfig, 'logLevel'>) {}

  public info(message: string, context?: Record<string, unknown>): void {
    console.log(this.format('INFO', message, context));
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    if (this.config.logLevel !== 'debug') {
      return;
    }

    console.log(this.format('DEBUG', message, context));
  }

  public error(message: string, context?: Record<string, unknown>): void {
    console.error(this.format('ERROR', message, context));
  }

  private format(
    level: 'INFO' | 'DEBUG' | 'ERROR',
    message: string,
    context?: Record<string, unknown>
  ): string {
    const payload = {
      ts: new Date().toISOString(),
      level,
      message,
      ...(context ? { context } : {}),
    };

    return JSON.stringify(payload);
  }
}
