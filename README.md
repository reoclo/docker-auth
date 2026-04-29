# Reoclo Docker Auth (`@reoclo/docker-auth`)

Log in to a container registry on a [Reoclo](https://reoclo.com) managed server using a registry credential stored in your Reoclo tenant.

Pairs with [`@reoclo/run`](https://github.com/reoclo/run) and [`@reoclo/checkout`](https://github.com/reoclo/checkout) for full CI workflows that build, push, and pull from private registries without copying passwords into GitHub Secrets.

## Why

Most registry login GitHub Actions require you to copy the registry password into a GitHub Actions secret for every repository that needs it. `@reoclo/docker-auth` sources the password from your Reoclo tenant instead, so you get:

- **One place to rotate.** Update the password in the Reoclo dashboard and every workflow picks up the new value on the next run.
- **Per-key access control.** Scope each automation API key to exactly the credentials and servers it is allowed to use.
- **Full audit trail.** Every login and logout is recorded with the originating repository, workflow, actor, and commit.
- **No copies of your password in GitHub Secrets.** The credential never leaves your Reoclo tenant.

## Quick Start

```yaml
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

1. Create a registry credential in Reoclo. Open **Registry Credentials** in the dashboard, click **Add Credential**, pick your provider (Docker Hub, GitHub Container Registry, AWS ECR, Google Artifact Registry, Azure ACR, Harbor, or Generic), enter the username and password or token, save, and copy the credential UUID from the detail page.
2. Create an Automation API key. Open **API Keys**, switch to the **Automation Keys** tab, click **Create Key**, and give it a name (for example, `github-prod`). Set **Allowed Operations** to include `registry_login` and `registry_logout`. Set **Allowed Servers** to the target server.
3. Add the API key and credential UUID as GitHub Actions secrets: `REOCLO_API_KEY`, `REOCLO_SERVER_ID`, `REOCLO_GHCR_CREDENTIAL_ID` (or whatever name fits your registry).

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api_key` | yes | - | Reoclo automation API key |
| `server_id` | yes | - | Target server ID |
| `credential_id` | yes | - | Reoclo registry credential UUID |
| `cleanup` | no | `true` | Run docker logout in a post-step at job end |

## Outputs

| Output | Description |
|--------|-------------|
| `operation_id` | Reoclo automation operation ID for the login |
| `registry_url` | Resolved registry URL (ghcr.io, docker.io, ECR host, etc.) |
| `registry_type` | Registry provider (docker_hub, ghcr, aws_ecr, ...) |

## Examples

### Log in to multiple registries

```yaml
- name: Log in to GHCR
  uses: reoclo/docker-auth@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    credential_id: ${{ secrets.REOCLO_GHCR_CREDENTIAL_ID }}

- name: Log in to Docker Hub
  uses: reoclo/docker-auth@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    credential_id: ${{ secrets.REOCLO_DOCKERHUB_CREDENTIAL_ID }}
```

### Opt out of automatic logout

```yaml
- uses: reoclo/docker-auth@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    credential_id: ${{ secrets.REOCLO_GHCR_CREDENTIAL_ID }}
    cleanup: 'false'
```

### Capture the resolved registry URL

```yaml
- id: login
  uses: reoclo/docker-auth@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    credential_id: ${{ secrets.REOCLO_GHCR_CREDENTIAL_ID }}

- run: echo "Logged into ${{ steps.login.outputs.registry_url }}"
```

## How It Works

1. The action posts to `POST /api/automation/v1/registry-auth/login` with your credential UUID.
2. The Reoclo API resolves the credential, looks up the target server, and dispatches a `docker login` to the runner agent on that server.
3. The runner executes the login locally on the server. The password never leaves your Reoclo tenant.
4. On job end, the post-step posts to `POST /api/automation/v1/registry-auth/logout` to clean up.

## Security

- The registry password is decrypted in the Reoclo API only at dispatch time, never logged or returned in API responses.
- The runner agent receives the password over an encrypted channel and feeds it to `docker login --password-stdin`.
- Both login and logout are recorded in the Reoclo audit log with the originating repository, workflow, actor, and commit.
- API keys can be scoped to specific operations (`registry_login`, `registry_logout`) and specific servers, so a leaked key from one workflow cannot pivot to other servers or actions.

## License

MIT
