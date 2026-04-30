type AuthMode = "vault" | "passthrough";
interface ResolvedMode {
    mode: AuthMode;
}
declare function resolveAuthMode(credentialId: string, username: string, accessToken: string, registryUrl: string): ResolvedMode;
declare function run(): Promise<void>;
export { run, resolveAuthMode };
