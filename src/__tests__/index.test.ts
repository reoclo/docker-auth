import { beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../index.js";

// Hoist mocks before any imports
const {
  mockGetInput,
  mockSetOutput,
  mockSetFailed,
  mockInfo,
  mockWarning,
  mockSaveState,
  mockSetSecret,
} = vi.hoisted(() => ({
  mockGetInput: vi.fn(),
  mockSetOutput: vi.fn(),
  mockSetFailed: vi.fn(),
  mockInfo: vi.fn(),
  mockWarning: vi.fn(),
  mockSaveState: vi.fn(),
  mockSetSecret: vi.fn(),
}));

vi.mock("@actions/core", () => ({
  getInput: mockGetInput,
  setOutput: mockSetOutput,
  setFailed: mockSetFailed,
  info: mockInfo,
  warning: mockWarning,
  saveState: mockSaveState,
  setSecret: mockSetSecret,
}));

const { mockLoginRegistry, mockLoginRegistryDirect, mockPollUntilComplete } = vi.hoisted(() => ({
  mockLoginRegistry: vi.fn(),
  mockLoginRegistryDirect: vi.fn(),
  mockPollUntilComplete: vi.fn(),
}));

vi.mock("../client.js", () => ({
  ReocloClient: class {
    loginRegistry = mockLoginRegistry;
    loginRegistryDirect = mockLoginRegistryDirect;
    pollUntilComplete = mockPollUntilComplete;
  },
}));

// Helper to configure getInput responses
function setupInputs(inputs: Record<string, string>) {
  mockGetInput.mockImplementation((name: string) => inputs[name] ?? "");
}

// Successful completed operation for polling
const completedDetail = {
  operation_id: "op-1",
  operation_type: "registry_login",
  server_id: "srv-1",
  server_name: "prod",
  status: "completed" as const,
  result: { exit_code: 0, stdout: "Login Succeeded", stderr: "", duration_ms: 100 },
  started_at: "2026-04-30T00:00:00Z",
};

// Run the action with the current mock state
async function runIndex(): Promise<void> {
  await run();
}

describe("resolveAuthMode — validation matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoginRegistry.mockResolvedValue({
      operation_id: "op-1",
      status: "running",
      registry_url: "ghcr.io",
      registry_type: "ghcr",
    });
    mockLoginRegistryDirect.mockResolvedValue({
      operation_id: "op-2",
      status: "running",
      registry_url: "ghcr.io",
      registry_type: "ghcr",
    });
    mockPollUntilComplete.mockResolvedValue(completedDetail);
  });

  it("vault-only: credential_id set, passthrough fields empty → calls loginRegistry", async () => {
    setupInputs({
      api_key: "rca_test",
      server_id: "srv-1",
      credential_id: "cred-uuid",
      username: "",
      access_token: "",
      registry_url: "",
      cleanup: "true",
      api_url: "https://api.reoclo.com",
    });

    await runIndex();

    expect(mockSetFailed).not.toHaveBeenCalled();
    expect(mockLoginRegistry).toHaveBeenCalledOnce();
    expect(mockLoginRegistryDirect).not.toHaveBeenCalled();
    expect(mockLoginRegistry.mock.calls[0]?.[0]).toMatchObject({
      server_id: "srv-1",
      credential_id: "cred-uuid",
    });
  });

  it("passthrough-only: all three passthrough fields set → calls loginRegistryDirect", async () => {
    setupInputs({
      api_key: "rca_test",
      server_id: "srv-1",
      credential_id: "",
      username: "myuser",
      access_token: "ghp_secret",
      registry_url: "ghcr.io",
      cleanup: "true",
      api_url: "https://api.reoclo.com",
    });

    await runIndex();

    expect(mockSetFailed).not.toHaveBeenCalled();
    expect(mockLoginRegistryDirect).toHaveBeenCalledOnce();
    expect(mockLoginRegistry).not.toHaveBeenCalled();
    expect(mockLoginRegistryDirect.mock.calls[0]?.[0]).toMatchObject({
      server_id: "srv-1",
      username: "myuser",
      access_token: "ghp_secret",
      registry_url: "ghcr.io",
    });
  });

  it("passthrough-only: access_token is masked via setSecret immediately", async () => {
    setupInputs({
      api_key: "rca_test",
      server_id: "srv-1",
      credential_id: "",
      username: "myuser",
      access_token: "ghp_secret",
      registry_url: "ghcr.io",
      cleanup: "true",
      api_url: "https://api.reoclo.com",
    });

    await runIndex();

    expect(mockSetSecret).toHaveBeenCalledWith("ghp_secret");
    // setSecret must be called before loginRegistryDirect
    const setSecretOrder = mockSetSecret.mock.invocationCallOrder[0]!;
    const loginOrder = mockLoginRegistryDirect.mock.invocationCallOrder[0]!;
    expect(setSecretOrder).toBeLessThan(loginOrder);
  });

  it("neither mode: both credential_id and passthrough fields empty → setFailed with guidance", async () => {
    setupInputs({
      api_key: "rca_test",
      server_id: "srv-1",
      credential_id: "",
      username: "",
      access_token: "",
      registry_url: "",
      cleanup: "true",
      api_url: "https://api.reoclo.com",
    });

    await runIndex();

    expect(mockSetFailed).toHaveBeenCalledOnce();
    expect(mockSetFailed.mock.calls[0]?.[0]).toMatch(/Provide either credential_id/);
    expect(mockLoginRegistry).not.toHaveBeenCalled();
    expect(mockLoginRegistryDirect).not.toHaveBeenCalled();
  });

  it("both modes: credential_id and passthrough fields set → setFailed mutually exclusive", async () => {
    setupInputs({
      api_key: "rca_test",
      server_id: "srv-1",
      credential_id: "cred-uuid",
      username: "myuser",
      access_token: "ghp_secret",
      registry_url: "ghcr.io",
      cleanup: "true",
      api_url: "https://api.reoclo.com",
    });

    await runIndex();

    expect(mockSetFailed).toHaveBeenCalledOnce();
    expect(mockSetFailed.mock.calls[0]?.[0]).toMatch(/mutually exclusive/);
    expect(mockLoginRegistry).not.toHaveBeenCalled();
    expect(mockLoginRegistryDirect).not.toHaveBeenCalled();
  });

  it("partial passthrough: only username set → setFailed with missing fields list", async () => {
    setupInputs({
      api_key: "rca_test",
      server_id: "srv-1",
      credential_id: "",
      username: "myuser",
      access_token: "",
      registry_url: "",
      cleanup: "true",
      api_url: "https://api.reoclo.com",
    });

    await runIndex();

    expect(mockSetFailed).toHaveBeenCalledOnce();
    const msg = mockSetFailed.mock.calls[0]?.[0] as string;
    expect(msg).toMatch(/Missing/);
    expect(msg).toMatch(/access_token/);
    expect(msg).toMatch(/registry_url/);
    expect(mockLoginRegistry).not.toHaveBeenCalled();
    expect(mockLoginRegistryDirect).not.toHaveBeenCalled();
  });
});
