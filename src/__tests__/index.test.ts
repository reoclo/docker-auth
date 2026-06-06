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
  mockAddPath,
} = vi.hoisted(() => ({
  mockGetInput: vi.fn(),
  mockSetOutput: vi.fn(),
  mockSetFailed: vi.fn(),
  mockInfo: vi.fn(),
  mockWarning: vi.fn(),
  mockSaveState: vi.fn(),
  mockSetSecret: vi.fn(),
  mockAddPath: vi.fn(),
}));

vi.mock("@actions/core", () => ({
  getInput: mockGetInput,
  setOutput: mockSetOutput,
  setFailed: mockSetFailed,
  info: mockInfo,
  warning: mockWarning,
  saveState: mockSaveState,
  setSecret: mockSetSecret,
  addPath: mockAddPath,
}));

const { mockEnsureCli, mockRunReoclo } = vi.hoisted(() => ({
  mockEnsureCli: vi.fn(),
  mockRunReoclo: vi.fn(),
}));

vi.mock("../cli.js", () => ({
  ensureCli: mockEnsureCli,
  runReoclo: mockRunReoclo,
}));

// Helper to configure getInput responses
function setupInputs(inputs: Record<string, string>) {
  mockGetInput.mockImplementation((name: string) => inputs[name] ?? "");
}

const loginJson = JSON.stringify({
  operation_id: "op-1",
  registry_url: "ghcr.io",
  registry_type: "ghcr",
});

// Run the action with the current mock state
async function runIndex(): Promise<void> {
  await run();
}

describe("resolveAuthMode — validation matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunReoclo.mockReturnValue({ status: 0, stdout: loginJson, stderr: "" });
  });

  it("vault-only: credential_id set, passthrough fields empty → runs reoclo with --credential", async () => {
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
    expect(mockEnsureCli).toHaveBeenCalledOnce();
    expect(mockRunReoclo).toHaveBeenCalledOnce();
    const args = mockRunReoclo.mock.calls[0]?.[0] as string[];
    expect(args).toEqual([
      "registry",
      "login",
      "srv-1",
      "--credential",
      "cred-uuid",
      "--output",
      "json",
    ]);
    const env = mockRunReoclo.mock.calls[0]?.[1] as NodeJS.ProcessEnv;
    expect(env.REOCLO_AUTOMATION_KEY).toBe("rca_test");
    expect(env.REOCLO_API_URL).toBe("https://api.reoclo.com");
  });

  it("passthrough-only: all three fields set → runs reoclo with passthrough flags", async () => {
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
    const args = mockRunReoclo.mock.calls[0]?.[0] as string[];
    expect(args).toEqual([
      "registry",
      "login",
      "srv-1",
      "--username",
      "myuser",
      "--access-token",
      "ghp_secret",
      "--registry-url",
      "ghcr.io",
      "--output",
      "json",
    ]);
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
    // setSecret must be called before reoclo is invoked
    const setSecretOrder = mockSetSecret.mock.invocationCallOrder[0]!;
    const runOrder = mockRunReoclo.mock.invocationCallOrder[0]!;
    expect(setSecretOrder).toBeLessThan(runOrder);
  });

  it("neither mode: both credential_id and passthrough empty → setFailed with guidance", async () => {
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
    expect(mockRunReoclo).not.toHaveBeenCalled();
  });

  it("both modes: credential_id and passthrough set → setFailed mutually exclusive", async () => {
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
    expect(mockRunReoclo).not.toHaveBeenCalled();
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
    expect(mockRunReoclo).not.toHaveBeenCalled();
  });
});

describe("login output handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses login JSON and sets outputs + state", async () => {
    setupInputs({
      api_key: "rca_test",
      server_id: "srv-1",
      credential_id: "cred-uuid",
      cleanup: "true",
      api_url: "https://api.reoclo.com",
    });
    mockRunReoclo.mockReturnValue({ status: 0, stdout: loginJson, stderr: "" });

    await runIndex();

    expect(mockSetFailed).not.toHaveBeenCalled();
    expect(mockSetOutput).toHaveBeenCalledWith("operation_id", "op-1");
    expect(mockSetOutput).toHaveBeenCalledWith("registry_url", "ghcr.io");
    expect(mockSetOutput).toHaveBeenCalledWith("registry_type", "ghcr");
    expect(mockSaveState).toHaveBeenCalledWith("login_performed", "true");
    expect(mockSaveState).toHaveBeenCalledWith("cleanup", "true");
    expect(mockSaveState).toHaveBeenCalledWith("server_id", "srv-1");
    expect(mockSaveState).toHaveBeenCalledWith("registry_url", "ghcr.io");
    expect(mockSaveState).toHaveBeenCalledWith("api_key", "rca_test");
    expect(mockSaveState).toHaveBeenCalledWith("api_url", "https://api.reoclo.com");
  });

  it("does not save login_performed when cleanup is false", async () => {
    setupInputs({
      api_key: "rca_test",
      server_id: "srv-1",
      credential_id: "cred-uuid",
      cleanup: "false",
      api_url: "https://api.reoclo.com",
    });
    mockRunReoclo.mockReturnValue({ status: 0, stdout: loginJson, stderr: "" });

    await runIndex();

    expect(mockSaveState).toHaveBeenCalledWith("cleanup", "false");
  });

  it("fails when reoclo exits non-zero", async () => {
    setupInputs({
      api_key: "rca_test",
      server_id: "srv-1",
      credential_id: "cred-uuid",
      cleanup: "true",
      api_url: "https://api.reoclo.com",
    });
    mockRunReoclo.mockReturnValue({ status: 1, stdout: "", stderr: "credential not in scope" });

    await runIndex();

    expect(mockSetFailed).toHaveBeenCalledOnce();
    expect(mockSetFailed.mock.calls[0]?.[0]).toMatch(/credential not in scope/);
    expect(mockSetOutput).not.toHaveBeenCalled();
  });

  it("fails when reoclo output is not valid JSON", async () => {
    setupInputs({
      api_key: "rca_test",
      server_id: "srv-1",
      credential_id: "cred-uuid",
      cleanup: "true",
      api_url: "https://api.reoclo.com",
    });
    mockRunReoclo.mockReturnValue({ status: 0, stdout: "not json", stderr: "" });

    await runIndex();

    expect(mockSetFailed).toHaveBeenCalledOnce();
    expect(mockSetFailed.mock.calls[0]?.[0]).toMatch(/parse reoclo login output/);
  });
});
