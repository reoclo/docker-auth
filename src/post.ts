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

  try {
    const client = new ReocloClient(apiKey, apiUrl);
    await client.logoutRegistry({
      server_id: serverId,
      registry_url: registryUrl,
      run_id: process.env["GITHUB_RUN_ID"],
      run_context: buildRunContext(),
    });
    core.info(`Logged out of ${registryUrl}`);
  } catch (error) {
    // Cleanup failure should never fail the job — matches actions/cache convention
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`docker-auth cleanup failed: ${message}`);
  }
}

post();
