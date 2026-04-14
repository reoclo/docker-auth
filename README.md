# Reoclo Docker Auth (`@reoclo/docker-auth`)

Log in to a container registry on a [Reoclo](https://reoclo.com)-managed server using a registry credential stored in your Reoclo tenant.

Pairs with [`@reoclo/run`](https://github.com/reoclo/run) and [`@reoclo/checkout`](https://github.com/reoclo/checkout) for full CI workflows that build, push, and pull from private registries without copying passwords into GitHub Secrets.

## Why

Most registry login GitHub Actions require you to copy the registry password into a GitHub Actions secret for every repository that needs it. `@reoclo/docker-auth` sources the password from your Reoclo tenant instead, so you get:

- **One place to rotate.** Update the password in the Reoclo dashboard and every workflow picks up the new value on the next run.
- **Per-key access control.** Scope each automation API key to exactly the credentials and servers it is allowed to use.
- **Full audit trail.** Every login and logout is recorded with the originating repository, workflow, actor, and commit.
- **No copies of your password in GitHub Secrets.** The credential never leaves your Reoclo tenant.

## Quick Start

```yaml
name: Build and push private image
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Log in to private GHCR
        uses: reoclo/docker-auth@v1
        with:
          api_key: ${{ secrets.REOCLO_API_KEY }}
          server_id: ${{ secrets.REOCLO_SERVER_ID }}
          credential_id: ${{ secrets.REOCLO_GHCR_CREDENTIAL_ID }}

      - name: Build and push on server
        uses: reoclo/run@v1
        with:
          api_key: ${{ secrets.REOCLO_API_KEY }}
          server_id: ${{ secrets.REOCLO_SERVER_ID }}
          working_directory: /opt/deploy/workspace
          command: |
            docker build -t ghcr.io/myorg/myapp:${{ github.sha }} .
            docker push ghcr.io/myorg/myapp:${{ github.sha }}
          timeout: 600
```

The login happens on your Reoclo server, so your next `@reoclo/run` steps can build, push, or pull from the same registry without any extra plumbing. When the job ends, a cleanup step automatically logs out.

## Setup

1. **Create a registry credential in Reoclo.**
   1. Open **Registry Credentials** in the dashboard.
   2. Click **Add Credential** and pick your provider (Docker Hub, GitHub Container Registry, AWS ECR, Google Artifact Registry, Azure ACR, Harbor, or Generic).
   3. Enter the username and password or token for that provider.
   4. Save and copy the credential UUID from the detail page.
2. **Create an Automation API key.**
   1. Open **API Keys** and switch to the **Automation Keys** tab.
   2. Click **Create Key** and give it a name (for example, `github-prod`).
   3. Set **Allowed Operations** to include `registry_login` (and `registry_logout` for the cleanup step).
   4. Set **Allowed Servers** to the target server.
   5. Set **Allowed Credentials** to include the credential from step 1.
   6. Save and copy the plaintext key. It is shown once.
3. **Add the secrets to your GitHub repository.**
   1. `REOCLO_API_KEY`: the automation key you just created.
   2. `REOCLO_SERVER_ID`: the UUID of your Reoclo server.
   3. `REOCLO_<NAME>_CREDENTIAL_ID`: one per registry credential you plan to use.

The fastest way to get the exact snippet is the **Use in CI** button on the Registry Credentials page. It pre-fills the credential and server UUIDs for you.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api_key` | Yes |  | Reoclo automation API key (starts with `rca_`). |
| `server_id` | Yes |  | Target Reoclo server UUID. |
| `credential_id` | Yes |  | Reoclo registry credential UUID. |
| `cleanup` | No | `true` | Run `docker logout` on the target server at job end. |

## Outputs

| Output | Description |
|--------|-------------|
| `operation_id` | Reoclo operation ID for the login. Useful for cross-referencing the audit log. |
| `registry_url` | Resolved registry URL (for example, `ghcr.io`, `docker.io`, or the ECR host). |
| `registry_type` | Registry provider (`docker_hub`, `ghcr`, `aws_ecr`, `google_artifact_registry`, `azure_acr`, `harbor`, `generic`). |

## Examples

### Log in to multiple registries

Use one step per credential. Each step creates its own login and logout in the audit log, which keeps failures scoped to a single credential.

```yaml
- name: Log in to GHCR
  uses: reoclo/docker-auth@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    credential_id: ${{ secrets.REOCLO_GHCR_CREDENTIAL_ID }}

- name: Log in to AWS ECR
  uses: reoclo/docker-auth@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    credential_id: ${{ secrets.REOCLO_ECR_CREDENTIAL_ID }}
```

### Opt out of automatic logout

Use this when the credential should persist across multiple jobs in the same workflow run. Not recommended for ephemeral runners.

```yaml
- uses: reoclo/docker-auth@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    credential_id: ${{ secrets.REOCLO_CREDENTIAL_ID }}
    cleanup: 'false'
```

### Capture the resolved registry URL

```yaml
- name: Log in
  id: login
  uses: reoclo/docker-auth@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    credential_id: ${{ secrets.REOCLO_ECR_CREDENTIAL_ID }}

- name: Pull image
  uses: reoclo/run@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    command: docker pull ${{ steps.login.outputs.registry_url }}/myapp:latest
```

## How It Works

1. The action calls the Reoclo API with the server ID and the credential ID.
2. Reoclo logs in to the registry on your server.
3. The action waits for the login to finish and sets `registry_url`, `registry_type`, and `operation_id` as outputs.
4. Subsequent workflow steps on the same server can pull or push from the registry.
5. When the job ends, the action runs `docker logout` on the server so the login does not persist.

Every step is recorded in your Reoclo audit log along with the GitHub workflow context.

## Security

- The registry password is never returned to the GitHub Actions runner.
- The action's outputs contain only the resolved registry URL, the registry provider type, and a Reoclo operation ID.
- Logins and logouts are recorded in your Reoclo audit log alongside the repository, workflow, actor, and commit that triggered them.
- Automation API keys must explicitly allow each credential they can use. Keys cannot reference credentials outside your tenant.
- If you enable cleanup (the default), `docker logout` runs on the server at job end so the credential does not stay resident on the server filesystem.

## License

MIT
