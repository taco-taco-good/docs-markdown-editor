# Docker Deployment

Use the repository root `.env` together with [compose.yml](/Users/taco/projects/docs-markdown-editor/deploy/docker/compose.yml).

Example:

```bash
docker compose -f deploy/docker/compose.yml up -d --build
```

For registry-based deploys:

```bash
export IMAGE_NAME=ghcr.io/<owner>/<repo>:main
docker compose -f deploy/docker/compose.yml pull
docker compose -f deploy/docker/compose.yml up -d
```

Required root `.env` keys:

```env
WORKSPACE_ROOT=/data
WORKSPACE_ROOT_HOST=/absolute/path/to/docs-data
HOST=0.0.0.0
PORT=3001
```
