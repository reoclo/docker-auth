import * as core from "@actions/core";
import { ensureCli, runReoclo } from "./cli.js";

type AuthMode = "vault" | "passthrough";

interface ResolvedMode {
  mode: AuthMode;
}

/**
 * Mirror the reoclo CLI's resolveAuthMode semantics: vault and passthrough are
 * mutually exclusive; passthrough requires all three of username/access_token/registry_url.
 */
function resolveAuthMode(
  credentialId: string,
  username: string,
  accessToken: string,
  registryUrl: string,
): ResolvedMode {
  const hasCredential = credentialId !== "";
  const passthroughFields = { username, access_token: accessToken, registry_url: registryUrl };
  const setPassthrough = Object.entries(passthroughFields).filter(([, v]) => v !== "");
  const hasAnyPassthrough = setPassthrough.length > 0;
  const hasAllPassthrough = setPassthrough.length === 3;

  if (hasCredential && hasAnyPassthrough) {
    throw new Error(
      "credential_id and passthrough fields are mutually exclusive. Provide one mode, not both.",
    );
  }

  if (!hasCredential && !hasAnyPassthrough) {
    throw new Error(
      "Provide either credential_id (vault mode) OR username + access_token + registry_url (passthrough mode).",
    );
  }

  if (!hasCredential && hasAnyPassthrough && !hasAllPassthrough) {
    const missing = Object.entries(passthroughFields)
      .filter(([, v]) => v === "")
      .map(([k]) => k)
      .join(", ");
    throw new Error(
      `Passthrough mode requires all three: username, access_token, registry_url. Missing: ${missing}.`,
    );
  }

  return { mode: hasCredential ? "vault" : "passthrough" };
}

interface LoginOutput {
  operation_id: string;
  registry_url: string;
  registry_type: string;
}

async function run(): Promise<void> {
  try {
    const apiKey = core.getInput("api_key", { required: true });
    const serverId = core.getInput("server_id", { required: true });
    const credentialId = core.getInput("credential_id");
    const username = core.getInput("username");
    // Mask the access token immediately before any other code path can log it.
    const accessToken = core.getInput("access_token");
    if (accessToken) {
      core.setSecret(accessToken);
    }
    const registryUrl = core.getInput("registry_url");
    const cleanup = (core.getInput("cleanup") || "true") !== "false";
    const apiUrl = core.getInput("api_url") || "https://api.reoclo.com";

    const { mode } = resolveAuthMode(credentialId, username, accessToken, registryUrl);

    ensureCli();

    // Build the reoclo argv. Secrets (access_token) are passed as discrete argv
    // entries — never interpolated into a shell string.
    const args = ["registry", "login", serverId];
    if (mode === "vault") {
      core.info(`Logging in to Reoclo registry credential ${credentialId}...`);
      args.push("--credential", credentialId);
    } else {
      core.info(`Logging in to ${registryUrl} via passthrough mode...`);
      args.push(
        "--username",
        username,
        "--access-token",
        accessToken,
        "--registry-url",
        registryUrl,
      );
    }
    args.push("--output", "json");

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      REOCLO_AUTOMATION_KEY: apiKey,
      REOCLO_API_URL: apiUrl,
    };

    const result = runReoclo(args, env);
    if (result.status !== 0) {
      // stderr may contain a CLI error message; access_token is masked by setSecret.
      const detail = (result.stderr || result.stdout).trim();
      core.setFailed(`reoclo registry login failed (exit ${result.status}): ${detail}`);
      return;
    }

    let parsed: LoginOutput;
    try {
      parsed = JSON.parse(result.stdout) as LoginOutput;
    } catch {
      core.setFailed(`Failed to parse reoclo login output as JSON: ${result.stdout.trim()}`);
      return;
    }

    core.setOutput("operation_id", parsed.operation_id);
    core.setOutput("registry_url", parsed.registry_url);
    core.setOutput("registry_type", parsed.registry_type);

    core.info(`Logged in to ${parsed.registry_url} on server ${serverId}`);

    // Wire the post step — only after a successful login. Inputs are not
    // available in the post step, so the values it needs are saved as state.
    // Re-mask the api_key before saving (state is not printed, but defensive).
    core.setSecret(apiKey);
    core.saveState("login_performed", "true");
    core.saveState("cleanup", cleanup ? "true" : "false");
    core.saveState("server_id", serverId);
    core.saveState("registry_url", parsed.registry_url);
    core.saveState("api_key", apiKey);
    core.saveState("api_url", apiUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`docker-auth failed: ${message}`);
  }
}

export { run, resolveAuthMode };

// Only auto-run when executed directly (not when imported by tests)
if (process.env["VITEST"] !== "true") {
  run();
}
