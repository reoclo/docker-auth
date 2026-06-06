type AuthMode = "vault" | "passthrough";
interface ResolvedMode {
    mode: AuthMode;
}
/**
 * Mirror the reoclo CLI's resolveAuthMode semantics: vault and passthrough are
 * mutually exclusive; passthrough requires all three of username/access_token/registry_url.
 */
declare function resolveAuthMode(credentialId: string, username: string, accessToken: string, registryUrl: string): ResolvedMode;
declare function run(): Promise<void>;
export { run, resolveAuthMode };
