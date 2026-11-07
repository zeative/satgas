# Cloud mode

Satgas is open source and runs on your own machine or server. This page describes how one copy of it runs as a customer's workspace inside a managed service (Satgas Cloud, coming later), and the contract between that workspace and the service's control plane. Nothing here changes a self-hosted Satgas: it all stays off unless `SATGAS_CLOUD=1`.

## How it fits together

- Every customer gets their own container running the same `ghcr.io/zeative/satgas` image everyone self-hosts. Agents have full access to the machine they run on, so customers never share one.
- A separate control plane, which is not part of this repository, handles accounts, plans, billing and starting containers. It talks to each workspace only through the contract below.
- In cloud mode the workspace opens from the control plane instead of a token, does not update itself, and tells the control plane how much work it did. Everything else is plain Satgas.

## Settings

| Variable                  | Meaning                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `SATGAS_CLOUD=1`          | Turns cloud mode on.                                                  |
| `SATGAS_CLOUD_INSTANCE`   | This workspace's id: letters, digits, `-` or `_`, 3 to 64 characters. |
| `SATGAS_CLOUD_URL`        | The control plane's base URL, over https.                             |
| `SATGAS_CLOUD_PUBLIC_KEY` | The control plane's Ed25519 public key, as 32 bytes in base64.        |
| `SATGAS_CLOUD_SECRET`     | A shared secret of 32 or more characters for signing reports.         |

Satgas refuses to start in cloud mode when any of these is missing or malformed, and says which.

## Contract, version 1

### Opening a workspace

The control plane sends the person to `https://<workspace>/api/auth/cloud?ticket=<ticket>`. A ticket is `v1.<payload>.<signature>`:

- `payload` is base64url JSON: `{"v":1,"aud":"<instance>","sub":"<user id>","email":"…","name":"…","iat":<seconds>,"exp":<seconds>,"jti":"<unique id>"}`.
- `signature` is the base64url Ed25519 signature of the bytes `v1.<payload>`, made with the control plane's private key.
- A ticket opens only the instance in `aud`, lives at most 120 seconds (`exp - iat`), allows 30 seconds of clock difference, and works once per `jti`.

A good ticket sets the usual session cookie and redirects to `/`. In cloud mode, pasted tokens, sign-in links and token rotation are refused.

### Reporting work

Every 10 seconds the workspace posts what happened to `POST <url>/v1/instances/<instance>/events`:

```json
{
  "v": 1,
  "dropped": 0,
  "events": [
    { "type": "round.started", "run": "c8cdb173", "round": 0, "at": 1794050000000 },
    {
      "type": "lead.planned",
      "run": "c8cdb173",
      "round": 0,
      "tasks": 3,
      "usage": { "input": 18000, "cached": 12000, "output": 900 },
      "at": 1794050004000
    },
    {
      "type": "task.finished",
      "run": "c8cdb173",
      "round": 0,
      "task": "build-hero",
      "agent": "claude",
      "status": "done",
      "ms": 412000,
      "usage": { "input": 2100000, "cached": 1800000, "output": 26000 },
      "at": 1794050416000
    }
  ]
}
```

- Events carry ids, counts, model names and timings, never a prompt, a file, a reply or anything a person wrote.
- Headers: `x-satgas-instance: <instance>` and `x-satgas-signature: sha256=<hex HMAC-SHA256 of the raw body with SATGAS_CLOUD_SECRET>`. The control plane rejects a request whose signature does not match.
- Up to 100 events per request. When the control plane cannot be reached, events wait and the workspace tries again later, waiting longer each time. At most 1,000 wait; past that the oldest are dropped and `dropped` says how many.

### The plan's state

The answer to a report, and to `GET <url>/v1/instances/<instance>/quota` (signed over its path, `/v1/instances/<instance>/quota`), may carry:

```json
{ "quota": { "blocked": true, "message": "This month's 200 tasks are used. Upgrade or wait until 1 December." } }
```

While `blocked` is true, a new round fails at once with `message` and no agent runs. Boards, files and running work stay as they are. The workspace asks at start and every 5 minutes, so a block lifts without waiting for new work.

## Starting a workspace

`deploy/cloud/docker-compose.yml` is the template the control plane fills in for each customer: one container with memory and CPU limits, its data in one volume (so a backup is one folder), a health check, and the settings above.
