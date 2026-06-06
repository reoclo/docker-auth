import * as core from "@actions/core";
import { ensureCli, runReoclo } from "./cli.js";

async function post(): Promise<void> {
  if (core.getState("login_performed") !== "true") {
    return;
  }
  if (core.getState("cleanup") !== "true") {
    return;
  }

  const apiKey = core.getState("api_key");
  const apiUrl = core.getState("api_url");
  const serverId = core.getState("server_id");
  const registryUrl = core.getState("registry_url");

  if (!apiKey || !apiUrl || !serverId || !registryUrl) {
    core.warning(
      "docker-auth cleanup skipped: post-step state missing (login step likely failed)",
    );
    return;
  }

  // Re-mask the api_key defensively in the post step's log context.
  core.setSecret(apiKey);

  try {
    ensureCli();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      REOCLO_AUTOMATION_KEY: apiKey,
      REOCLO_API_URL: apiUrl,
    };
    const result = runReoclo(
      ["registry", "logout", serverId, "--registry-url", registryUrl],
      env,
    );
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout).trim();
      core.warning(`docker-auth cleanup failed (exit ${result.status}): ${detail}`);
      return;
    }
    core.info(`Logged out of ${registryUrl}`);
  } catch (error) {
    // Cleanup failure should never fail the job — matches actions/cache convention.
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`docker-auth cleanup failed: ${message}`);
  }
}

post();
