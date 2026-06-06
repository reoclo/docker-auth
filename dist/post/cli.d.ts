declare const REOCLO_VERSION = "0.44.1";
interface RunResult {
    status: number;
    stdout: string;
    stderr: string;
}
/**
 * Ensure the pinned reoclo CLI (v0.43.1) is installed and on PATH.
 * Skips the install if `reoclo --version` already reports the pinned version.
 */
export declare function ensureCli(): void;
/**
 * Run a reoclo subcommand with an argv array. The reoclo binary is resolved via
 * PATH (which ensureCli updates). Returns the captured stdout/stderr and status.
 */
export declare function runReoclo(args: string[], env: NodeJS.ProcessEnv): RunResult;
export { REOCLO_VERSION };
