import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import * as core from "@actions/core";

const REOCLO_VERSION = "0.44.0";
const REOCLO_PIN = `v${REOCLO_VERSION}`;
const INSTALL_URL = `https://github.com/reoclo/cli/releases/download/${REOCLO_PIN}/install.sh`;
// SHA-256 of the pinned release's install.sh (stable across releases). Verified
// before execution; the installer then verifies the binary against SHA256SUMS.
const INSTALL_SHA256 = "2ea6c2766d2cf5def9a022ed255874f9a48ce1da5184a36df9e8e547a98cfa94";

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
  // Download install.sh as raw bytes and verify it against the pinned checksum
  // before executing it. The installer then verifies the binary via SHA256SUMS.
  const script = spawnSync("curl", ["-fsSL", INSTALL_URL], { maxBuffer: 16 * 1024 * 1024 });
  if (script.error) {
    throw script.error;
  }
  if ((script.status ?? 1) !== 0) {
    throw new Error(
      `Failed to download reoclo install.sh (exit ${script.status}): ${String(script.stderr ?? "")}`,
    );
  }
  const scriptBuf = script.stdout as Buffer;
  const actualSha = createHash("sha256").update(scriptBuf).digest("hex");
  if (actualSha !== INSTALL_SHA256) {
    throw new Error(
      `reoclo install.sh checksum mismatch: expected ${INSTALL_SHA256}, got ${actualSha}`,
    );
  }

  const install = spawnSync(
    "sh",
    ["-s", "--", "--version", REOCLO_PIN, "--install-dir", installDir, "--no-modify-path"],
    { input: scriptBuf, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
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
