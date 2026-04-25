---
name: docker-and-containers
description: Build and run containerized applications. Use when creating Dockerfiles, writing docker-compose files, containerizing a service, or preparing an application for deployment. Use when an application needs to run consistently across environments.
---

# Docker and Containers

## Overview

A container packages an application and its runtime dependencies so it runs identically everywhere — developer laptop, CI, staging, production. Docker is the standard tooling. The goal is reproducible builds, minimal image sizes, and local dev environments that mirror production.

## When to Use

- Containerizing a new service
- Writing or modifying a Dockerfile
- Setting up local multi-service development with docker-compose
- Preparing an app for deployment to any container platform
- Debugging environment inconsistencies ("works on my machine")

---

## Dockerfile Best Practices

### Node.js multi-stage build

```dockerfile
# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency files first (cache busting: only reinstall when these change)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source and build
COPY . .
RUN npm run build     # if you have a build step; omit for pure Node apps

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Run as non-root user (security)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

WORKDIR /app

# Copy only what the running app needs
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist         ./dist
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
```

### Python multi-stage build

```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

FROM python:3.12-slim AS runtime
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser
WORKDIR /app
COPY --from=builder /root/.local /home/appuser/.local
COPY --chown=appuser:appgroup . .
ENV PATH=/home/appuser/.local/bin:$PATH
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:8000/health || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Layer Caching Rules

Docker caches each instruction as a layer. A cache miss invalidates all subsequent layers. Order instructions from least-changing to most-changing:

```dockerfile
# ✓ Correct order: deps change rarely, source changes often
COPY package.json package-lock.json ./   # layer 1: rarely changes
RUN npm ci                               # layer 2: only reruns when layer 1 changes
COPY . .                                 # layer 3: changes every build
RUN npm run build                        # layer 4: only reruns when source changes

# ✗ Wrong: source copy before deps → npm ci reruns on every source change
COPY . .
RUN npm ci
```

---

## .dockerignore

Always have a `.dockerignore`. Without it, `COPY . .` sends node_modules, .git, and test artifacts to the build context.

```
node_modules
.git
.gitignore
.env
.env.*
dist
build
coverage
.nyc_output
*.log
*.md
docker-compose*.yml
Dockerfile*
.DS_Store
```

---

## docker-compose for Local Development

```yaml
# docker-compose.yml
version: "3.9"

services:
  api:
    build:
      context: .
      target: runtime           # use the runtime stage
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      DATABASE_URL: postgres://user:pass@db:5432/myapp
      REDIS_URL: redis://cache:6379
    volumes:
      - ./src:/app/src           # hot reload: mount source over the image copy
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: myapp
    volumes:
      - db_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"             # expose for local tools (TablePlus, psql)
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d myapp"]
      interval: 5s
      timeout: 3s
      retries: 5

  cache:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  db_data:
```

### Common commands

```bash
# Start all services (build if needed)
docker compose up --build

# Start in background
docker compose up -d

# View logs
docker compose logs -f api

# Shell into a running container
docker compose exec api sh

# Run a one-off command
docker compose run --rm api npx knex migrate:latest

# Stop and remove containers
docker compose down

# Stop and remove containers + volumes (wipes the database)
docker compose down -v
```

---

## Environment Variables

Never bake secrets into images. Inject at runtime.

```dockerfile
# ✓ Declare with ENV for defaults (non-sensitive config only)
ENV NODE_ENV=production
ENV PORT=3000

# ✗ Never bake secrets into the image
ENV DATABASE_PASSWORD=supersecret   # DON'T do this
```

**Runtime injection options:**

```bash
# docker run
docker run -e DATABASE_URL="postgres://..." myapp

# docker-compose: .env file (not committed to git)
# .env
DATABASE_URL=postgres://user:pass@localhost/myapp

# docker-compose.yml references it
environment:
  DATABASE_URL: ${DATABASE_URL}
```

---

## Health Checks

Every service container must have a health check. Container orchestrators (Kubernetes, ECS, Fly.io) use it to know when a container is ready to serve traffic.

```dockerfile
# HTTP health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/health || exit 1
```

The `/health` endpoint must:
- Return 200 OK when the service is ready
- Return 5xx when the service is not ready (db unavailable, etc.)
- Respond in under 5 seconds
- Not require authentication

```js
// Minimal health endpoint
app.get('/health', async (req, res) => {
  try {
    await db.raw('SELECT 1');    // check db connectivity
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});
```

---

## Image Size Hygiene

Keep images small — smaller images pull faster and have a smaller attack surface.

```bash
# Check image size
docker images myapp

# Inspect layers to find what's taking space
docker history myapp

# Use dive to analyze layer contents
docker run --rm -it -v /var/run/docker.sock:/var/run/docker.sock wagoodman/dive myapp
```

Rules:
- Use `-alpine` or `-slim` base images
- Multi-stage builds: don't ship build tools in the runtime image
- `RUN npm ci --omit=dev` — don't install devDependencies in production
- `RUN apt-get install -y ... && rm -rf /var/lib/apt/lists/*` — clean apt cache in same layer

---

## Building and Tagging

```bash
# Build for local use
docker build -t myapp:local .

# Build for production (use commit SHA as tag)
GIT_SHA=$(git rev-parse --short HEAD)
docker build -t myapp:${GIT_SHA} -t myapp:latest .

# Build a specific stage
docker build --target builder -t myapp:builder .

# Push to a registry
docker tag myapp:latest registry.example.com/myapp:latest
docker push registry.example.com/myapp:latest
```

---

## Verification

Before shipping any containerized service:

- [ ] `docker build .` succeeds from a clean checkout
- [ ] `docker compose up` starts all services cleanly
- [ ] Health check endpoint responds 200 within start period
- [ ] `.dockerignore` excludes `node_modules`, `.env`, `.git`
- [ ] No secrets baked into the image (`docker history` shows no ENV secrets)
- [ ] Image runs as non-root user
- [ ] Multi-stage build used (runtime image contains no build tools)
- [ ] Image size is reasonable (Node: < 200MB, Python: < 300MB)
- [ ] Migrations run successfully: `docker compose run --rm api npx knex migrate:latest`
- [ ] Container exits cleanly on SIGTERM (handles graceful shutdown)
