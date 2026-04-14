export interface RunContext {
    provider: string;
    repository: string;
    workflow: string;
    trigger: string;
    actor: string;
    sha?: string;
    ref?: string;
}
export interface RegistryLoginRequest {
    server_id: string;
    credential_id: string;
    run_id?: string;
    run_context?: RunContext;
}
export interface RegistryLoginResponse {
    operation_id: string;
    status: string;
    registry_url: string;
    registry_type: string;
}
export interface RegistryLogoutRequest {
    server_id: string;
    registry_url: string;
    run_id?: string;
    run_context?: RunContext;
}
export type OperationStatus = "running" | "completed" | "failed" | "timeout";
export interface OperationResult {
    exit_code?: number;
    stdout?: string;
    stderr?: string;
    duration_ms?: number;
}
export interface OperationDetail {
    operation_id: string;
    operation_type: string;
    server_id: string;
    server_name: string;
    status: OperationStatus;
    result?: OperationResult;
    run_id?: string;
    run_context?: Record<string, unknown>;
    started_at: string;
    completed_at?: string;
}
