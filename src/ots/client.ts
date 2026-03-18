import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { $ } from 'bun';
import type { AppConfig } from '../config.ts';
import type { ResolvedTargetEvent } from '../domain/job.ts';
import { AppLogger } from '../logger.ts';
import { NostrClient } from '../nostr/client.ts';
import { type VerifyProofResult, verifyProofResultSchema } from './schema.ts';

const VERIFY_PROOF_SCRIPT = join(import.meta.dir, 'verify-proof.py');

export class OtsClient {
  public constructor(
    private readonly config: AppConfig,
    private readonly nostrClient: NostrClient,
    private readonly logger: AppLogger
  ) {}

  public async stampEventId(
    eventId: string
  ): Promise<{ inputPath: string; otsPath: string; otsBase64: string }> {
    mkdirSync(this.config.otsDataDir, { recursive: true });

    const inputPath = join(this.config.otsDataDir, `${eventId}.txt`);
    const otsPath = `${inputPath}.ots`;

    if (await Bun.file(otsPath).exists()) {
      this.logger.info('Reusing existing OpenTimestamps proof', {
        eventId,
        otsPath,
      });

      return this.readProofResult(inputPath, otsPath);
    }

    mkdirSync(dirname(inputPath), { recursive: true });
    await Bun.write(inputPath, `${eventId}\n`);

    const calendarArgs = this.config.otsCalendarUrls.flatMap((url) => [
      '-c',
      url,
    ]);

    const command = ['ots', 'stamp', ...calendarArgs, inputPath];

    this.logger.info('Starting OpenTimestamps stamp command', {
      eventId,
      inputPath,
      otsPath,
      command,
    });

    try {
      const result = await $`${command}`.quiet();

      this.logger.debug('OpenTimestamps stamp command finished', {
        eventId,
        exitCode: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
      });
    } catch (error) {
      const details = this.describeCommandError(error);

      const otsFile = Bun.file(otsPath);
      if (
        (details.message.includes('File exists') ||
          details.stderr?.includes('File exists')) &&
        (await otsFile.exists())
      ) {
        this.logger.info(
          'OpenTimestamps proof file already existed after stamp attempt; reusing file',
          {
            eventId,
            otsPath,
            ...details,
          }
        );

        return this.readProofResult(inputPath, otsPath);
      }

      this.logger.error('OpenTimestamps stamp command failed', {
        eventId,
        ...details,
      });

      throw new Error(details.message);
    }

    const otsFile = Bun.file(otsPath);
    if (!(await otsFile.exists())) {
      throw new Error(`Expected OTS proof file at ${otsPath}`);
    }

    return this.readProofResult(inputPath, otsPath);
  }

  private async readProofResult(
    inputPath: string,
    otsPath: string
  ): Promise<{ inputPath: string; otsPath: string; otsBase64: string }> {
    const otsFile = Bun.file(otsPath);
    const otsBuffer = Buffer.from(await otsFile.arrayBuffer());

    return {
      inputPath,
      otsPath,
      otsBase64: otsBuffer.toString('base64'),
    };
  }

  public async validateRuntimeDependencies(): Promise<void> {
    const script = [
      'import importlib.util, json, sys',
      'modules = ["opentimestamps", "otsclient", "bitcoin"]',
      'missing = [name for name in modules if importlib.util.find_spec(name) is None]',
      'print(json.dumps({"python": sys.executable, "missing": missing}, separators=(",", ":")))',
      'raise SystemExit(1 if missing else 0)',
    ].join('; ');

    try {
      const output = await this.runOtsCommand(
        [this.config.otsPythonBin, '-c', script],
        'OpenTimestamps Python runtime validation failed',
        { otsPythonBin: this.config.otsPythonBin }
      );
      const result = JSON.parse(output) as {
        python: string;
        missing: string[];
      };

      this.logger.info('Validated OpenTimestamps Python runtime', {
        otsPythonBin: this.config.otsPythonBin,
        pythonExecutable: result.python,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `OpenTimestamps Python runtime is not usable with ${this.config.otsPythonBin}. ` +
          'Required Python modules are missing: opentimestamps, otsclient, or bitcoin. ' +
          'Container runs must use the image-bundled interpreter configured in environment variables; local development must point OTS_PYTHON_BIN to a Python environment where the OpenTimestamps dependencies are installed. ' +
          `Underlying error: ${message}`
      );
    }
  }

  public cleanupProofArtifacts(paths: Array<string | undefined>): void {
    for (const path of paths) {
      if (!path) {
        continue;
      }

      try {
        rmSync(path, { force: true });
      } catch (error) {
        this.logger.debug(
          'Failed to remove temporary OpenTimestamps artifact',
          {
            path,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }
  }

  public async verifyEventId(targetInput: string): Promise<VerifyProofResult> {
    const { eventId, otsPath } = await this.ensureCachedProof(targetInput);

    const rawOutput = await this.runPythonScript(
      VERIFY_PROOF_SCRIPT,
      [
        eventId,
        otsPath,
        this.config.bitcoinApiUrl,
        this.config.otsVerifyCacheDir,
      ],
      'OpenTimestamps verification command failed',
      {
        eventId,
        otsPath,
        bitcoinApiUrl: this.config.bitcoinApiUrl,
        otsVerifyCacheDir: this.config.otsVerifyCacheDir,
      }
    );

    const parsed = verifyProofResultSchema
      .omit({ targetEventId: true })
      .parse(JSON.parse(rawOutput));

    this.logger.info(
      'Verified OpenTimestamps proof against public Bitcoin API',
      {
        eventId,
        otsPath,
        provider: parsed.provider,
        blockHeight: parsed.blockHeight,
        blockHash: parsed.blockHash,
        attestedTime: parsed.attestedTime,
      }
    );

    return {
      targetEventId: eventId,
      ...parsed,
    };
  }

  private getOtsPath(eventId: string): string {
    return join(this.config.otsDataDir, `${eventId}.txt.ots`);
  }

  private async ensureCachedProof(
    targetInput: string
  ): Promise<{ eventId: string; otsPath: string }> {
    const resolvedInput = this.nostrClient.resolveInput(targetInput);
    const eventId = resolvedInput.eventId;

    if (!eventId) {
      const target = await this.nostrClient.resolveAndFetchTarget(targetInput);
      const resolvedOtsPath = this.getOtsPath(target.eventId);

      if (!existsSync(resolvedOtsPath)) {
        await this.populateProofCache(target, resolvedOtsPath);
      }

      if (!existsSync(resolvedOtsPath)) {
        throw new Error(
          `No OTS proof found for event ${target.eventId} at ${resolvedOtsPath}`
        );
      }

      return { eventId: target.eventId, otsPath: resolvedOtsPath };
    }

    const otsPath = this.getOtsPath(eventId);
    if (existsSync(otsPath)) {
      return { eventId, otsPath };
    }

    const target = await this.nostrClient.resolveAndFetchTarget(targetInput);
    await this.populateProofCache(target, otsPath);

    if (!existsSync(otsPath)) {
      throw new Error(`No OTS proof found for event ${eventId} at ${otsPath}`);
    }

    return { eventId, otsPath };
  }

  private async populateProofCache(
    target: ResolvedTargetEvent,
    otsPath: string
  ): Promise<void> {
    const proofBase64 =
      await this.nostrClient.fetchAttestationProofBase64(target);
    if (!proofBase64) {
      throw new Error(
        `No NIP-03 attestation found for event ${target.eventId}`
      );
    }

    const inputPath = otsPath.endsWith('.ots')
      ? otsPath.slice(0, -4)
      : `${otsPath}.txt`;
    mkdirSync(dirname(otsPath), { recursive: true });
    await Bun.write(inputPath, `${target.eventId}\n`);
    await Bun.write(otsPath, Buffer.from(proofBase64, 'base64'));

    this.logger.info('Cached OpenTimestamps proof from Nostr attestation', {
      targetEventId: target.eventId,
      otsPath,
    });
  }

  private async runOtsCommand(
    command: string[],
    failureMessage: string,
    context: Record<string, unknown>
  ): Promise<string> {
    try {
      const result = await $`${command}`.quiet();
      const stdout = result.stdout.toString().trim();

      this.logger.debug('OpenTimestamps command finished', {
        ...context,
        command,
        exitCode: result.exitCode,
        stdout,
        stderr: result.stderr.toString(),
      });

      return stdout;
    } catch (error) {
      const details = this.describeCommandError(error);
      this.logger.error(failureMessage, {
        ...context,
        command,
        ...details,
      });
      throw new Error(details.message);
    }
  }

  private async runPythonScript(
    scriptPath: string,
    args: string[],
    failureMessage: string,
    context: Record<string, unknown>
  ): Promise<string> {
    const command = [this.config.otsPythonBin, scriptPath, ...args];
    return this.runOtsCommand(command, failureMessage, context);
  }

  private describeCommandError(error: unknown): {
    message: string;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
  } {
    if (error && typeof error === 'object') {
      const commandError = error as {
        exitCode?: number;
        stdout?: Uint8Array | string;
        stderr?: Uint8Array | string;
        message?: string;
      };

      const stdout = this.toText(commandError.stdout);
      const stderr = this.toText(commandError.stderr);
      const message =
        stderr ||
        stdout ||
        commandError.message ||
        'OpenTimestamps command failed';

      return {
        message,
        exitCode: commandError.exitCode,
        stdout,
        stderr,
      };
    }

    return {
      message: error instanceof Error ? error.message : String(error),
    };
  }

  private toText(value: Uint8Array | string | undefined): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    return typeof value === 'string'
      ? value
      : Buffer.from(value).toString().trim();
  }
}
