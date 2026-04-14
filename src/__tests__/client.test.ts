import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPostJson, mockGetJson } = vi.hoisted(() => ({
  mockPostJson: vi.fn(),
  mockGetJson: vi.fn(),
}));

vi.mock("@actions/http-client", () => ({
  HttpClient: class {
    postJson = mockPostJson;
    getJson = mockGetJson;
  },
}));

import { ReocloClient } from "../client.js";

describe("ReocloClient.loginRegistry", () => {
  beforeEach(() => {
    mockPostJson.mockReset();
    mockGetJson.mockReset();
  });

  it("accepts 202 and returns the login response", async () => {
    mockPostJson.mockResolvedValueOnce({
      statusCode: 202,
      result: {
        operation_id: "op-123",
        status: "running",
        registry_url: "ghcr.io",
        registry_type: "ghcr",
      },
      headers: {},
    });

    const client = new ReocloClient("rca_test", "https://api.reoclo.com");
    const response = await client.loginRegistry({
      server_id: "server-1",
      credential_id: "cred-1",
    });

    expect(response.operation_id).toBe("op-123");
    expect(response.registry_url).toBe("ghcr.io");
    expect(response.registry_type).toBe("ghcr");
    expect(mockPostJson).toHaveBeenCalledOnce();
    expect(mockPostJson.mock.calls[0]?.[0]).toBe(
      "https://api.reoclo.com/api/automation/v1/registry-auth/login",
    );
  });

  it("throws on non-2xx status code", async () => {
    mockPostJson.mockResolvedValueOnce({
      statusCode: 403,
      result: { detail: "Credential not in scope for this key" },
      headers: {},
    });

    const client = new ReocloClient("rca_test", "https://api.reoclo.com");
    await expect(
      client.loginRegistry({ server_id: "s", credential_id: "c" }),
    ).rejects.toThrow(/403/);
  });

  it("strips trailing slashes from the API URL", async () => {
    mockPostJson.mockResolvedValueOnce({
      statusCode: 202,
      result: {
        operation_id: "op-123",
        status: "running",
        registry_url: "ghcr.io",
        registry_type: "ghcr",
      },
      headers: {},
    });

    const client = new ReocloClient("rca_test", "https://api.reoclo.com/");
    await client.loginRegistry({ server_id: "s", credential_id: "c" });
    expect(mockPostJson.mock.calls[0]?.[0]).toBe(
      "https://api.reoclo.com/api/automation/v1/registry-auth/login",
    );
  });
});

describe("ReocloClient.logoutRegistry", () => {
  beforeEach(() => {
    mockPostJson.mockReset();
  });

  it("returns void on successful logout", async () => {
    mockPostJson.mockResolvedValueOnce({
      statusCode: 200,
      result: { operation_id: "op-456", status: "completed" },
      headers: {},
    });

    const client = new ReocloClient("rca_test", "https://api.reoclo.com");
    await expect(
      client.logoutRegistry({ server_id: "s", registry_url: "ghcr.io" }),
    ).resolves.toBeUndefined();
    expect(mockPostJson.mock.calls[0]?.[0]).toBe(
      "https://api.reoclo.com/api/automation/v1/registry-auth/logout",
    );
  });

  it("throws on non-200 status code", async () => {
    mockPostJson.mockResolvedValueOnce({
      statusCode: 500,
      result: { detail: "internal error" },
      headers: {},
    });

    const client = new ReocloClient("rca_test", "https://api.reoclo.com");
    await expect(
      client.logoutRegistry({ server_id: "s", registry_url: "ghcr.io" }),
    ).rejects.toThrow(/500/);
  });
});

describe("ReocloClient.getOperation", () => {
  beforeEach(() => {
    mockGetJson.mockReset();
  });

  it("returns the operation detail on 200", async () => {
    mockGetJson.mockResolvedValueOnce({
      statusCode: 200,
      result: {
        operation_id: "op-789",
        operation_type: "registry_login",
        server_id: "server-1",
        server_name: "prod-api",
        status: "completed",
        started_at: "2026-04-14T01:00:00Z",
        result: { exit_code: 0, stdout: "Login Succeeded", stderr: "", duration_ms: 150 },
      },
      headers: {},
    });

    const client = new ReocloClient("rca_test", "https://api.reoclo.com");
    const detail = await client.getOperation("op-789");
    expect(detail.status).toBe("completed");
    expect(detail.result?.exit_code).toBe(0);
  });

  it("throws on 404", async () => {
    mockGetJson.mockResolvedValueOnce({
      statusCode: 404,
      result: { detail: "Operation not found" },
      headers: {},
    });
    const client = new ReocloClient("rca_test", "https://api.reoclo.com");
    await expect(client.getOperation("missing")).rejects.toThrow(/404/);
  });
});
