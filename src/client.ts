import { HttpClient } from "@actions/http-client";
import type {
  OperationDetail,
  RegistryLoginDirectRequest,
  RegistryLoginRequest,
  RegistryLoginResponse,
  RegistryLogoutRequest,
} from "./types.js";

const POLL_INTERVAL_MS = 5_000;

export class ReocloClient {
  private http: HttpClient;
  private baseUrl: string;

  constructor(apiKey: string, apiUrl: string) {
    this.baseUrl = apiUrl.replace(/\/+$/, "");
    this.http = new HttpClient("reoclo-docker-auth-action", [], {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  async loginRegistry(request: RegistryLoginRequest): Promise<RegistryLoginResponse> {
    const url = `${this.baseUrl}/api/automation/v1/registry-auth/login`;
    const response = await this.http.postJson<RegistryLoginResponse>(url, request);
    if (response.statusCode !== 202 && response.statusCode !== 200) {
      throw new Error(
        `Reoclo API returned ${response.statusCode}: ${JSON.stringify(response.result)}`,
      );
    }
    if (!response.result) {
      throw new Error("Reoclo API returned empty response");
    }
    return response.result;
  }

  async loginRegistryDirect(request: RegistryLoginDirectRequest): Promise<RegistryLoginResponse> {
    const url = `${this.baseUrl}/api/automation/v1/registry-auth/login-direct`;
    const response = await this.http.postJson<RegistryLoginResponse>(url, request);
    if (response.statusCode !== 202 && response.statusCode !== 200) {
      throw new Error(
        `Reoclo API returned ${response.statusCode}: ${JSON.stringify(response.result)}`,
      );
    }
    if (!response.result) {
      throw new Error("Reoclo API returned empty response");
    }
    return response.result;
  }

  async logoutRegistry(request: RegistryLogoutRequest): Promise<void> {
    const url = `${this.baseUrl}/api/automation/v1/registry-auth/logout`;
    const response = await this.http.postJson<unknown>(url, request);
    if (response.statusCode !== 200) {
      throw new Error(
        `Reoclo API returned ${response.statusCode}: ${JSON.stringify(response.result)}`,
      );
    }
  }

  async getOperation(operationId: string): Promise<OperationDetail> {
    const url = `${this.baseUrl}/api/automation/v1/operations/${operationId}`;
    const response = await this.http.getJson<OperationDetail>(url);
    if (response.statusCode !== 200) {
      throw new Error(
        `Reoclo API returned ${response.statusCode}: ${JSON.stringify(response.result)}`,
      );
    }
    if (!response.result) {
      throw new Error("Reoclo API returned empty response");
    }
    return response.result;
  }

  async pollUntilComplete(
    operationId: string,
    onUpdate?: (detail: OperationDetail) => void,
  ): Promise<OperationDetail> {
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const detail = await this.getOperation(operationId);
      if (onUpdate) {
        onUpdate(detail);
      }
      if (detail.status !== "running") {
        return detail;
      }
    }
  }
}
