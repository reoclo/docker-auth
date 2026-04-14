# Reoclo Docker Auth (`@reoclo/docker-auth`)

Log in to a container registry on a [Reoclo](https://reoclo.com)-managed server using a registry credential stored in Reoclo's tenant-scoped vault.

Pairs with [`@reoclo/run`](https://github.com/reoclo/run) and [`@reoclo/checkout`](https://github.com/reoclo/checkout) — orchestrate deployments from GitHub Actions while Reoclo holds the registry secrets.

## Why

Most registry-login GitHub Actions (including `docker/login-action@v3`) require you to copy the registry password into GitHub Secrets per-repo. `@reoclo/docker-auth` sources the password from Reoclo's vault instead:

- **Central rotation** — rotate once in Reoclo, every workflow picks up the new value on next run.
- **Per-tenant ACLs** — scope each automation API key to the exact set of credentials and servers it may touch.
- **Envelope encryption at rest** — credentials are AES-256-GCM encrypted; decryption happens only inside Reoclo's worker process, never in the API layer or on the GitHub runner.
- **Audit trail** — every login and logout is recorded with the originating GitHub repo, workflow, actor, SHA, and ref.

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

The login runs on the **Reoclo-managed server**, not on the GitHub runner — so subsequent `@reoclo/run` steps that build, push, or pull from that registry work without extra plumbing. The post-step automatically runs `docker logout <registry>` at job end.

## Setup

1. **Create a registry credential in Reoclo**
   - Navigate to **Registry Credentials → Add Credential**.
   - Pick a provider (Docker Hub, GHCR, AWS ECR, Google Artifact Registry, Azure ACR, Harbor, or Generic).
   - Enter the username + password / token / JSON key.
   - Copy the credential UUID from the detail page.
2. **Create an Automation API key**
   - Navigate to **API Keys → Automation Keys → Create Key**.
   - Add `registry_login` (and optionally `registry_logout`) to the key's allowed operations.
   - Add the server ID(s) the key may target to `allowed_server_ids`.
   - Add the credential UUID from step 1 to `allowed_credential_ids`.
   - Save and copy the plaintext key (shown once).
3. **Add the secrets to GitHub Actions**
   - `REOCLO_API_KEY` — the automation key from step 2.
   - `REOCLO_SERVER_ID` — the target server's UUID.
   - `REOCLO_<NAME>_CREDENTIAL_ID` — one per registry credential you want to use.

The fastest way to get the exact YAML snippet is the **Use in CI** button on the Registry Credentials page in the dashboard — it pre-fills the credential and server UUIDs for you.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api_key` | yes | - | Reoclo automation API key (starts with `rca_`) |
| `server_id` | yes | - | Target Reoclo server UUID (must be a runner-connected server) |
| `credential_id` | yes | - | Reoclo registry credential UUID |
| `cleanup` | no | `true` | Run `docker logout <registry>` in a post-step at job end |
| `api_url` | no | `https://api.reoclo.com` | Reoclo API URL (for self-hosted instances) |

## Outputs

| Output | Description |
|--------|-------------|
| `operation_id` | Reoclo automation operation ID for the login |
| `registry_url` | Resolved registry URL (e.g. `ghcr.io`, `docker.io`, `123456789.dkr.ecr.us-east-1.amazonaws.com`) |
| `registry_type` | Registry provider (`docker_hub`, `ghcr`, `aws_ecr`, `google_artifact_registry`, `azure_acr`, `harbor`, `generic`) |

## Examples

### Log in to multiple registries

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

Each invocation creates its own login + logout operation in the audit log, keeping failures scoped to a single credential.

### Opt out of automatic logout

```yaml
- uses: reoclo/docker-auth@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    credential_id: ${{ secrets.REOCLO_CREDENTIAL_ID }}
    cleanup: 'false'
```

Use this when the credential should persist across multiple jobs in the same workflow run. Not recommended for ephemeral runners.

### Self-hosted Reoclo instance

```yaml
- uses: reoclo/docker-auth@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    credential_id: ${{ secrets.REOCLO_CREDENTIAL_ID }}
    api_url: https://reoclo.internal.company.com
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

1. The action calls `POST /api/automation/v1/registry-auth/login` with the server and credential UUIDs.
2. Reoclo's API enqueues a worker job (the API process itself never touches the plaintext credential).
3. A worker handler decrypts the credential (for AWS ECR, also exchanges it for a short-lived token), builds a `docker login ... --password-stdin` command, and dispatches it to the target server via the runner RPC.
4. The action polls the operation endpoint every 5 seconds until it completes.
5. On success, the action saves state (registry URL, server, API info) for the post-step.
6. At job end, the post-step calls `POST /api/automation/v1/registry-auth/logout` which runs `docker logout <registry>` on the server.

Every operation is audited with the originating repository, workflow, actor, SHA, and ref.

## Security

- **Password never in process args** — Docker CLI is invoked with `--password-stdin`, so the secret never appears in `ps`, shell history, or runner trace output.
- **Password never in API process** — decryption happens only in Reoclo's worker, per the existing `deploy/registry_auth.py` policy.
- **Password never in MongoDB** — `AutomationOperation.request_params` stores only the credential UUID, name, registry URL, and type.
- **Password never in GitHub logs** — only `operation_id`, `registry_url`, and `registry_type` are returned to the action; stderr is scrubbed to drop lines containing the username before it's returned.
- **Password never in audit log** — audit metadata mirrors the non-sensitive identifiers.
- **Per-key ACL** — automation keys must explicitly allow-list each credential UUID; cross-tenant references are rejected at create/update time.

## License

MIT
