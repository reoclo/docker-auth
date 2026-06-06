import { spawnSync } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import * as core from "@actions/core";

const REOCLO_VERSION = "0.44.0";
const REOCLO_PIN = `v${REOCLO_VERSION}`;
const INSTALL_URL = `https://github.com/reoclo/cli/releases/download/${REOCLO_PIN}/install.sh`;

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

/**
 * Run a command with an explicit argv array (never a shell string), so secrets
 * passed as arguments cannot be interpolated by a shell or leak via shell tracing.
 */
function runProcess(command: string, args: string[], env?: NodeJS.ProcessEnv): RunResult {
  const result = spawnSync(command, args, {
    env: env ?? process.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/** Return the installed reoclo version string, or null if reoclo is not on PATH. */
function installedVersion(): string | null {
  try {
    const result = spawnSync("reoclo", ["--version"], { encoding: "utf8" });
    if (result.status !== 0 || typeof result.stdout !== "string") {
      return null;
    }
    return result.stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Ensure the pinned reoclo CLI (v0.43.1) is installed and on PATH.
 * Skips the install if `reoclo --version` already reports the pinned version.
 */
export function ensureCli(): void {
  if (installedVersion() === REOCLO_VERSION) {
    core.info(`reoclo ${REOCLO_VERSION} already present`);
    return;
  }

  const runnerTemp = process.env["RUNNER_TEMP"] || os.tmpdir();
  const installDir = path.join(runnerTemp, "reoclo-bin");

  core.info(`Installing reoclo ${REOCLO_PIN} into ${installDir}...`);
  // Download install.sh and pipe it into `sh` over stdin, then pass the pin and
  // install options as argv. No secrets are involved here.
  const script = runProcess("curl", ["-fsSL", INSTALL_URL]);
  if (script.status !== 0) {
    throw new Error(`Failed to download reoclo install.sh (exit ${script.status}): ${script.stderr}`);
  }

  const install = spawnSync(
    "sh",
    ["-s", "--", "--version", REOCLO_PIN, "--install-dir", installDir, "--no-modify-path"],
    { input: script.stdout, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (install.error) {
    throw install.error;
  }
  if ((install.status ?? 1) !== 0) {
    throw new Error(
      `reoclo install.sh failed (exit ${install.status}): ${install.stderr ?? ""}`,
    );
  }

  core.addPath(installDir);
}

/**
 * Run a reoclo subcommand with an argv array. The reoclo binary is resolved via
 * PATH (which ensureCli updates). Returns the captured stdout/stderr and status.
 */
export function runReoclo(args: string[], env: NodeJS.ProcessEnv): RunResult {
  const installDir = path.join(process.env["RUNNER_TEMP"] || os.tmpdir(), "reoclo-bin");
  // Prepend the install dir to PATH for this process, since core.addPath only
  // affects subsequent steps, not the current process's child spawns.
  const mergedPath = `${installDir}${path.delimiter}${process.env["PATH"] ?? ""}`;
  return runProcess("reoclo", args, { ...env, PATH: mergedPath });
}

export { REOCLO_VERSION };
