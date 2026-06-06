import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetState, mockInfo, mockWarning, mockSetSecret } = vi.hoisted(() => ({
  mockGetState: vi.fn(),
  mockInfo: vi.fn(),
  mockWarning: vi.fn(),
  mockSetSecret: vi.fn(),
}));

vi.mock("@actions/core", () => ({
  getState: mockGetState,
  info: mockInfo,
  warning: mockWarning,
  setSecret: mockSetSecret,
}));

const { mockEnsureCli, mockRunReoclo } = vi.hoisted(() => ({
  mockEnsureCli: vi.fn(),
  mockRunReoclo: vi.fn(),
}));

vi.mock("../cli.js", () => ({
  ensureCli: mockEnsureCli,
  runReoclo: mockRunReoclo,
}));

function setupState(state: Record<string, string>) {
  mockGetState.mockImplementation((name: string) => state[name] ?? "");
}

const fullState = {
  login_performed: "true",
  cleanup: "true",
  server_id: "srv-1",
  registry_url: "ghcr.io",
  api_key: "rca_test",
  api_url: "https://api.reoclo.com",
};

// Importing the module runs post(); re-import per test via resetModules.
async function runPost(): Promise<void> {
  vi.resetModules();
  await import("../post.js");
  // Allow the floating post() promise to settle.
  await new Promise((r) => setTimeout(r, 0));
}

describe("post cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunReoclo.mockReturnValue({ status: 0, stdout: "", stderr: "" });
  });

  it("runs reoclo registry logout with saved state", async () => {
    setupState(fullState);
    await runPost();

    expect(mockEnsureCli).toHaveBeenCalledOnce();
    expect(mockRunReoclo).toHaveBeenCalledOnce();
    const args = mockRunReoclo.mock.calls[0]?.[0] as string[];
    expect(args).toEqual(["registry", "logout", "srv-1", "--registry-url", "ghcr.io"]);
    const env = mockRunReoclo.mock.calls[0]?.[1] as NodeJS.ProcessEnv;
    expect(env.REOCLO_AUTOMATION_KEY).toBe("rca_test");
    expect(env.REOCLO_API_URL).toBe("https://api.reoclo.com");
    expect(mockWarning).not.toHaveBeenCalled();
  });

  it("skips when login was not performed", async () => {
    setupState({ ...fullState, login_performed: "" });
    await runPost();
    expect(mockRunReoclo).not.toHaveBeenCalled();
  });

  it("skips when cleanup is not true", async () => {
    setupState({ ...fullState, cleanup: "false" });
    await runPost();
    expect(mockRunReoclo).not.toHaveBeenCalled();
  });

  it("warns (does not throw) when reoclo logout fails", async () => {
    setupState(fullState);
    mockRunReoclo.mockReturnValue({ status: 1, stdout: "", stderr: "boom" });
    await runPost();
    expect(mockWarning).toHaveBeenCalledOnce();
    expect(mockWarning.mock.calls[0]?.[0]).toMatch(/cleanup failed/);
  });

  it("warns when post-step state is missing", async () => {
    setupState({ login_performed: "true", cleanup: "true" });
    await runPost();
    expect(mockWarning).toHaveBeenCalledOnce();
    expect(mockWarning.mock.calls[0]?.[0]).toMatch(/state missing/);
    expect(mockRunReoclo).not.toHaveBeenCalled();
  });
});
