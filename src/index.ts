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

async function run(): Promise<void> {
  try {
    const apiKey = core.getInput("api_key", { required: true });
    const serverId = core.getInput("server_id", { required: true });
    const credentialId = core.getInput("credential_id", { required: true });
    const cleanup = (core.getInput("cleanup") || "true") !== "false";
    const apiUrl = core.getInput("api_url") || "https://api.reoclo.com";

    const client = new ReocloClient(apiKey, apiUrl);

    core.info(`Logging in to Reoclo registry credential ${credentialId}...`);
    const loginResponse = await client.loginRegistry({
      server_id: serverId,
      credential_id: credentialId,
      run_id: process.env["GITHUB_RUN_ID"],
      run_context: buildRunContext(),
    });

    core.setOutput("operation_id", loginResponse.operation_id);
    core.setOutput("registry_url", loginResponse.registry_url);
    core.setOutput("registry_type", loginResponse.registry_type);

    core.info(
      `Operation ${loginResponse.operation_id} submitted, polling for completion...`,
    );

    const detail = await client.pollUntilComplete(
      loginResponse.operation_id,
      (update) => {
        core.info(`Operation status: ${update.status}`);
      },
    );
    const result = detail.result ?? {};
    const exitCode = result.exit_code ?? 1;

    if (result.stdout) core.info(result.stdout);
    if (result.stderr) core.warning(result.stderr);

    if (exitCode !== 0) {
      core.setFailed(`docker login failed with exit code ${exitCode}`);
      return;
    }

    core.info(`Logged in to ${loginResponse.registry_url} on server ${serverId}`);

    // Wire the post step — only after a successful login
    core.saveState("login_performed", "true");
    core.saveState("server_id", serverId);
    core.saveState("api_key", apiKey);
    core.saveState("api_url", apiUrl);
    core.saveState("registry_url", loginResponse.registry_url);
    core.saveState("cleanup", cleanup ? "true" : "false");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`docker-auth failed: ${message}`);
  }
}

run();
