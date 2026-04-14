# Reoclo Docker Auth (`@reoclo/docker-auth`)

Log in to a container registry on a [Reoclo](https://reoclo.com)-managed server using a registry credential stored in Reoclo's tenant-scoped vault.

**Status:** scaffolded — action implementation pending (see M3 in the plan).

## Why

`@reoclo/docker-auth` sources registry passwords from Reoclo's vault instead of GitHub Secrets: central rotation, per-tenant ACLs, envelope-encryption-at-rest, full audit trail. Pairs with [`@reoclo/run`](https://github.com/reoclo/run) for subsequent `docker build`/`docker push` steps on the same server.

## Quick Start

```yaml
- name: Log in to private registry
  uses: reoclo/docker-auth@v1
  with:
    api_key: ${{ secrets.REOCLO_API_KEY }}
    server_id: ${{ secrets.REOCLO_SERVER_ID }}
    credential_id: ${{ secrets.REOCLO_CREDENTIAL_ID }}
```

## License

MIT
