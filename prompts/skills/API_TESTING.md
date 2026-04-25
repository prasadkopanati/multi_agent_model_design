---
name: api-testing
description: Test HTTP APIs with real HTTP calls. Use when building or modifying API endpoints. Use when you need to verify request/response contracts, authentication flows, error handling, and edge cases against a running server.
---

# API Testing

## Overview

API tests make real HTTP calls against a running server. They test the full stack from route handler to database and back — they are not unit tests of handler functions. The goal is to verify the contract: given this request, I get this response, every time.

## When to Use

- Building or modifying any HTTP endpoint
- Verifying authentication and authorization behavior
- Testing error responses and validation
- Checking pagination, filtering, and sorting
- Regression-testing before a release

---

## Tool Selection

Use the best tool available in your environment. All three approaches work across agents.

### Node.js: supertest (preferred for Node APIs)

```bash
# supertest should be available via NODE_PATH (agenticspiq node_modules)
# If not installed locally, install it:
npm install --save-dev supertest
```

```js
// tests/api/users.test.js
const request = require('supertest');
const app     = require('../../src/app');   // Express/Fastify app (not listening)

describe('POST /v1/users', () => {
  it('creates a user and returns 201', async () => {
    const res = await request(app)
      .post('/v1/users')
      .send({ email: 'test@example.com', name: 'Test User' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'test@example.com' });
    expect(res.body.data.id).toBeDefined();
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app)
      .post('/v1/users')
      .send({ email: 'not-an-email', name: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContainEqual(
      expect.objectContaining({ field: 'email' })
    );
  });
});
```

### Python: pytest + httpx (preferred for Python APIs)

```python
# tests/test_users.py
import pytest
from httpx import AsyncClient
from app.main import app   # FastAPI / Starlette app

@pytest.mark.anyio
async def test_create_user():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/v1/users", json={
            "email": "test@example.com",
            "name": "Test User"
        })
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["email"] == "test@example.com"
    assert "id" in data

@pytest.mark.anyio
async def test_create_user_invalid_email():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/v1/users", json={"email": "bad", "name": "X"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
```

### curl / httpie (any agent, any language)

Use for smoke checks against a running server:

```bash
# curl
curl -s -X POST http://localhost:3000/v1/users \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test"}' | jq .

# httpie (more readable)
http POST localhost:3000/v1/users email=test@example.com name="Test User"

# Assert status code
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET http://localhost:3000/v1/users)
[ "$STATUS" = "200" ] || { echo "Expected 200, got $STATUS"; exit 1; }
```

---

## Test Coverage Checklist

For every endpoint, cover:

```
[ ] Happy path (valid input → correct status + response shape)
[ ] Validation errors (missing required field, wrong type, out of range)
[ ] Authentication: missing token → 401
[ ] Authentication: invalid/expired token → 401
[ ] Authorization: valid token, wrong role → 403
[ ] Not found: resource doesn't exist → 404
[ ] Conflict: duplicate creation → 409 (if applicable)
[ ] Response envelope shape (data, meta, error keys present)
[ ] Pagination: first page, last page, out-of-range page
[ ] Idempotency: same request twice → same result (for PUT/DELETE)
```

---

## Authentication Testing

### JWT auth pattern

```js
// Test helper: generate a valid test token
function makeAuthHeader(payload = { userId: 'usr_test', role: 'member' }) {
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(payload, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

describe('GET /v1/users/me', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/v1/users/me');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid token', async () => {
    const res = await request(app)
      .get('/v1/users/me')
      .set(makeAuthHeader());
    expect(res.status).toBe(200);
  });

  it('returns 403 for wrong role', async () => {
    const res = await request(app)
      .get('/v1/admin/stats')
      .set(makeAuthHeader({ userId: 'usr_test', role: 'member' }));
    expect(res.status).toBe(403);
  });
});
```

---

## Database Isolation in Tests

Tests must not share state. Use one of these strategies:

### Option A: Transaction rollback (fastest)

Wrap each test in a transaction, roll back after:

```js
let trx;
beforeEach(async () => { trx = await db.transaction(); });
afterEach(async () => { await trx.rollback(); });
```

### Option B: Truncate tables between tests

```js
afterEach(async () => {
  await db('users').truncate();
  await db('posts').truncate();
});
```

### Option C: Separate test database

Set `DATABASE_URL` to a dedicated test database in CI and local test runs:

```
DATABASE_URL=postgres://localhost/myapp_test
```

Never run tests against a production or staging database.

---

## Contract Testing

A contract test verifies that a provider (your API) and a consumer (their client) agree on the interface. Use this when:
- Your API is consumed by another team or service
- You want to catch breaking changes before deployment

Minimal contract test pattern (no Pact required):

```js
// contracts/user-api-contract.json  ← version-controlled contract
{
  "GET /v1/users/:id": {
    "response": {
      "status": 200,
      "body": {
        "data": {
          "id": "string",
          "email": "string",
          "created_at": "iso8601"
        }
      }
    }
  }
}

// contract.test.js — validates the live API matches the contract
const contract = require('./contracts/user-api-contract.json');
// run assertions comparing actual response shapes to contract shapes
```

---

## Running Tests

```bash
# Node.js (Jest)
npx jest tests/api/

# Node.js (node:test)
node --test tests/api/*.test.js

# Python
pytest tests/ -v

# Smoke check a running server
curl -sf http://localhost:3000/health || { echo "Server not running"; exit 1; }
```

---

## What NOT to Do

```
✗ Mock the HTTP layer in integration tests — use supertest against the real app
✗ Test only the happy path and call it done
✗ Share test database state between test files (causes order-dependent failures)
✗ Hardcode auth tokens — generate them programmatically
✗ Assert the full response body structure using deep equality (brittle)
  → Use toMatchObject() or specific field assertions
✗ Make tests dependent on external services being available
  → Use test doubles at the external boundary only
```

---

## Verification

Before marking API work complete:

- [ ] Happy path test passes
- [ ] Validation error returns 400 with error.details
- [ ] Missing auth returns 401
- [ ] Wrong role returns 403
- [ ] Tests are isolated (no shared state between test runs)
- [ ] Tests run without an internet connection
- [ ] `npm test` or `pytest` exits 0
