import type { OperationDetail, RegistryLoginRequest, RegistryLoginResponse, RegistryLogoutRequest } from "./types.js";
export declare class ReocloClient {
    private http;
    private baseUrl;
    constructor(apiKey: string, apiUrl: string);
    loginRegistry(request: RegistryLoginRequest): Promise<RegistryLoginResponse>;
    logoutRegistry(request: RegistryLogoutRequest): Promise<void>;
    getOperation(operationId: string): Promise<OperationDetail>;
    pollUntilComplete(operationId: string, onUpdate?: (detail: OperationDetail) => void): Promise<OperationDetail>;
}
