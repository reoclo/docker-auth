import * as core from "@actions/core";
import { ReocloClient } from "./client.js";
import type { RunContext } from "./types.js";

function buildRunContext(): RunContext {
  return {
    provider: "github_actions",
    repository: process.env["GITHUB_REPOSITORY"] ?? "",
    workflow: process.env["GITHUB_WORKFLOW"] ?? "",
    trigger: process.env["GITHUB_EVENT_NAME"] ?? "",
    actor: process.env["GITHUB_ACTOR"] ?? "",
    sha: process.env["GITHUB_SHA"],
    ref: process.env["GITHUB_REF"],
  };
}

type AuthMode = "vault" | "passthrough";

interface ResolvedMode {
  mode: AuthMode;
}

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

async function run(): Promise<void> {
  try {
    const apiKey = core.getInput("api_key", { required: true });
    const serverId = core.getInput("server_id", { required: true });
    const credentialId = core.getInput("credential_id");
    const username = core.getInput("username");
    // Mask the access token immediately before any other code path can log it
    const accessToken = core.getInput("access_token");
    if (accessToken) {
      core.setSecret(accessToken);
    }
    const registryUrl = core.getInput("registry_url");
    const cleanup = (core.getInput("cleanup") || "true") !== "false";
    const apiUrl = core.getInput("api_url") || "https://api.reoclo.com";

    const { mode } = resolveAuthMode(credentialId, username, accessToken, registryUrl);

    const client = new ReocloClient(apiKey, apiUrl);

    let loginOperationId: string;
    let loginRegistryUrl: string;
    let loginRegistryType: string;

    if (mode === "vault") {
      core.info(`Logging in to Reoclo registry credential ${credentialId}...`);
      const loginResponse = await client.loginRegistry({
        server_id: serverId,
        credential_id: credentialId,
        run_id: process.env["GITHUB_RUN_ID"],
        run_context: buildRunContext(),
      });
      loginOperationId = loginResponse.operation_id;
      loginRegistryUrl = loginResponse.registry_url;
      loginRegistryType = loginResponse.registry_type;
    } else {
      core.info(`Logging in to ${registryUrl} via passthrough mode...`);
      const loginResponse = await client.loginRegistryDirect({
        server_id: serverId,
        registry_url: registryUrl,
        username,
        access_token: accessToken,
        run_id: process.env["GITHUB_RUN_ID"],
        run_context: buildRunContext(),
      });
      loginOperationId = loginResponse.operation_id;
      loginRegistryUrl = loginResponse.registry_url;
      loginRegistryType = loginResponse.registry_type;
    }

    core.setOutput("operation_id", loginOperationId);
    core.setOutput("registry_url", loginRegistryUrl);
    core.setOutput("registry_type", loginRegistryType);

    core.info(`Operation ${loginOperationId} submitted, polling for completion...`);

    const detail = await client.pollUntilComplete(loginOperationId, (update) => {
      core.info(`Operation status: ${update.status}`);
    });
    const result = detail.result ?? {};
    const exitCode = result.exit_code ?? 1;

    if (result.stdout) core.info(result.stdout);
    if (result.stderr) core.warning(result.stderr);

    if (exitCode !== 0) {
      core.setFailed(`docker login failed with exit code ${exitCode}`);
      return;
    }

    core.info(`Logged in to ${loginRegistryUrl} on server ${serverId}`);

    // Wire the post step — only after a successful login
    core.saveState("login_performed", "true");
    core.saveState("server_id", serverId);
    core.saveState("api_key", apiKey);
    core.saveState("api_url", apiUrl);
    core.saveState("registry_url", loginRegistryUrl);
    core.saveState("cleanup", cleanup ? "true" : "false");
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
