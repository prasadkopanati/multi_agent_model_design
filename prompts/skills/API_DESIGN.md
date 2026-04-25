---
name: api-design
description: Design stable, predictable REST APIs. Use when creating or modifying HTTP endpoints, defining request/response shapes, adding authentication, or writing API documentation. Use when designing any interface that will be consumed by clients you don't fully control.
---

# API Design

## Overview

A good API is a contract. Clients depend on it not changing arbitrarily. Design for stability, predictability, and clarity. The cost of a breaking change in a public API is high — design it right the first time, version it when you must change it.

## When to Use

- Creating new HTTP endpoints
- Modifying existing API response shapes
- Adding authentication or authorization to endpoints
- Writing an OpenAPI/Swagger specification
- Reviewing an API before it goes to production

---

## URL Design

### Resource naming

URLs name resources (nouns), not actions (verbs). The HTTP method is the verb.

```
✓ GET    /users               → list users
✓ POST   /users               → create a user
✓ GET    /users/{id}          → get a specific user
✓ PATCH  /users/{id}          → update a user (partial)
✓ PUT    /users/{id}          → replace a user (full)
✓ DELETE /users/{id}          → delete a user

✗ GET    /getUsers
✗ POST   /createUser
✗ POST   /users/delete/{id}
```

### Nesting and relationships

Nest only one level deep. Flat is better than deeply nested.

```
✓ GET /users/{id}/posts        → posts belonging to a user
✓ GET /posts/{id}/comments     → comments on a post

✗ GET /users/{id}/posts/{postId}/comments/{commentId}/replies
  → use GET /comments/{id}/replies instead
```

### Versioning

Always version your API. Prefix with `/v1/`, `/v2/` etc.

```
/v1/users
/v2/users     ← breaking change → new version
```

Never version individual endpoints — version the whole API surface.

---

## HTTP Method Semantics

| Method | Semantics | Idempotent | Body |
|---|---|---|---|
| GET | Read, no side effects | Yes | No |
| POST | Create / non-idempotent action | No | Yes |
| PUT | Full replacement | Yes | Yes |
| PATCH | Partial update | No (ideally yes) | Yes |
| DELETE | Remove | Yes | Optional |

**Idempotent** = calling it N times has the same effect as calling it once. Design PUT and DELETE to be safe to retry.

---

## Request and Response Shapes

### Consistent envelope for lists

```json
{
  "data": [...],
  "meta": {
    "total": 142,
    "page": 1,
    "per_page": 20,
    "has_next": true
  }
}
```

### Consistent envelope for single resources

```json
{
  "data": {
    "id": "usr_01HX...",
    "email": "user@example.com",
    "created_at": "2025-01-15T10:30:00Z"
  }
}
```

### Consistent error format

Every error response uses the same shape — clients can depend on it:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "field": "email", "message": "Must be a valid email address" },
      { "field": "age",   "message": "Must be at least 18" }
    ],
    "request_id": "req_01HX..."
  }
}
```

- `code`: machine-readable constant (uppercase, underscore-separated)
- `message`: human-readable sentence
- `details`: array for validation errors (field + message)
- `request_id`: trace ID for debugging

### Dates and IDs

```
Dates:   ISO 8601 UTC — "2025-01-15T10:30:00Z"  (never Unix timestamps in responses)
IDs:     Prefixed strings — "usr_01HX..." or UUIDs  (never sequential integers)
Booleans: true/false  (never 0/1 or "yes"/"no")
```

---

## Status Codes

Use the right code — don't return 200 for everything:

| Code | When |
|---|---|
| 200 OK | Successful GET, PUT, PATCH, DELETE |
| 201 Created | Successful POST that created a resource |
| 204 No Content | Success with no response body (DELETE) |
| 400 Bad Request | Client sent invalid data (validation errors) |
| 401 Unauthorized | Missing or invalid authentication |
| 403 Forbidden | Authenticated but not authorized for this resource |
| 404 Not Found | Resource doesn't exist |
| 409 Conflict | State conflict (duplicate, version mismatch) |
| 422 Unprocessable Entity | Valid format but business logic failure |
| 429 Too Many Requests | Rate limit exceeded |
| 500 Internal Server Error | Unexpected server failure (never expose internals) |

---

## Authentication Headers

### Bearer token (JWT or opaque)

```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

### API key

```
X-API-Key: sk_live_abc123...
```

Never accept credentials in query strings (`?token=...`) — they end up in server logs.

### Response headers for auth failures

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="api"
```

---

## Pagination

Always paginate list endpoints. Unbounded queries will cause production incidents.

### Cursor-based (preferred for large datasets)

```
GET /posts?cursor=eyJpZCI6MTAwfQ&limit=20

Response:
{
  "data": [...],
  "meta": {
    "next_cursor": "eyJpZCI6MTIwfQ",
    "has_next": true
  }
}
```

### Offset-based (simpler, acceptable for smaller datasets)

```
GET /posts?page=3&per_page=20

Response:
{
  "data": [...],
  "meta": { "total": 142, "page": 3, "per_page": 20, "has_next": true }
}
```

Default `per_page` to a reasonable number (20–50). Cap the maximum (100–200). Never allow unlimited.

---

## Rate Limiting Headers

Always communicate rate limit state to clients:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1705312800
Retry-After: 60       ← only on 429 responses
```

---

## OpenAPI Specification

Every API should have an OpenAPI 3.x spec. At minimum, document:

```yaml
openapi: "3.0.3"
info:
  title: "My API"
  version: "1.0.0"
paths:
  /users:
    get:
      summary: "List users"
      parameters:
        - name: page
          in: query
          schema: { type: integer, default: 1 }
      responses:
        "200":
          description: "Success"
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/UserList"
        "401":
          $ref: "#/components/responses/Unauthorized"
components:
  schemas:
    User:
      type: object
      required: [id, email, created_at]
      properties:
        id:          { type: string, example: "usr_01HX" }
        email:       { type: string, format: email }
        created_at:  { type: string, format: date-time }
```

---

## Input Validation

Validate at the route handler, before any business logic:

```js
// Express + zod example
const CreateUserSchema = z.object({
  email:    z.string().email(),
  name:     z.string().min(1).max(100),
  role:     z.enum(['admin', 'member']).default('member'),
});

router.post('/users', (req, res) => {
  const result = CreateUserSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: result.error.issues.map(i => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      }
    });
  }
  // proceed with result.data (typed and validated)
});
```

---

## Idempotency Keys

For POST requests that create resources or trigger side effects, support an idempotency key:

```
POST /payments
Idempotency-Key: idem_01HX...
```

Store the key and response. If the same key arrives again, return the cached response without re-executing.

---

## What NOT to Do

```
✗ Return 200 with { "success": false, "error": "Not found" }
✗ Include stack traces in error responses
✗ Accept tokens in query parameters
✗ Use camelCase in JSON for some endpoints and snake_case for others
✗ Change response shape without a version bump
✗ Return unbounded lists without pagination
✗ Use 500 when you mean 400 (don't hide client errors)
```

---

## Verification

Before shipping any API endpoint:

- [ ] URL uses nouns, not verbs
- [ ] Correct HTTP method and status codes
- [ ] Error responses use the standard error envelope
- [ ] Lists are paginated with meta
- [ ] Dates are ISO 8601 UTC strings
- [ ] Auth failures return 401/403, not 200
- [ ] Input validated at the route boundary
- [ ] OpenAPI spec updated (if one exists)
- [ ] No stack traces in any error response
- [ ] Rate limit headers present on all responses
