---
name: database-development
description: Design, migrate, and query databases safely. Use when creating or modifying database schemas, writing migrations, querying data, managing transactions, or optimizing slow queries. Use when any code touches a database.
---

# Database Development

## Overview

The database is the hardest part of a system to change after deployment. Schema decisions made on day one constrain the system for years. Migrations must be reversible, queries must be parameterized, and transactions must be scoped to the minimum required. Get these right upfront — retrofitting them is expensive.

## When to Use

- Creating or modifying database schemas
- Writing or reviewing SQL queries
- Building or running migrations
- Adding indexes or optimizing slow queries
- Writing database integration tests

---

## Schema Design Principles

### Every table needs these columns

```sql
id         TEXT PRIMARY KEY,              -- prefixed string: "usr_01HX..." or UUID
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Never use sequential integer IDs for external-facing resources — they leak enumeration information.

### Naming conventions

```
Tables:    plural snake_case    → users, blog_posts, order_items
Columns:   singular snake_case → user_id, created_at, is_active
Indexes:   idx_{table}_{columns} → idx_users_email
FK names:  fk_{table}_{ref_table} → fk_posts_users
```

### Nullable columns

Only make a column nullable if NULL has a distinct meaning from an empty value. A missing email and an empty email are different things.

```sql
-- ✓ Nullable: deleted_at being NULL means "not deleted"
deleted_at TIMESTAMPTZ

-- ✓ Nullable: optional relationship
manager_id TEXT REFERENCES users(id)

-- ✗ Don't nullable without purpose
name TEXT   -- should be NOT NULL if name is required
```

### Foreign keys

Always declare foreign keys explicitly. Don't rely on application-level joins without constraints.

```sql
CREATE TABLE posts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Migrations

### The golden rules

1. **Every schema change is a migration** — no manual `ALTER TABLE` in production
2. **Migrations are forward-only in production** — write a rollback but don't rely on it
3. **Each migration does one thing** — don't combine table creation and data backfill
4. **Test the migration on a copy of production data** before running it

### Knex (Node.js)

```bash
# Create a migration
npx knex migrate:make create_users_table

# Run pending migrations
npx knex migrate:latest

# Roll back the last batch
npx knex migrate:rollback
```

```js
// migrations/20250115_create_users_table.js
exports.up = async (knex) => {
  await knex.schema.createTable('users', (t) => {
    t.text('id').primary();
    t.text('email').notNullable().unique();
    t.text('name').notNullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTable('users');
};
```

### Prisma (Node.js)

```bash
# Generate migration from schema.prisma changes
npx prisma migrate dev --name create_users_table

# Apply migrations in CI/production
npx prisma migrate deploy

# Introspect existing DB
npx prisma db pull
```

```prisma
// schema.prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  posts     Post[]
}
```

### Zero-downtime migrations

Adding a column with a default is safe. Dropping a column requires two deployments:

```
Deployment 1: Stop writing to the column (remove writes in code)
Deployment 2: Drop the column
```

Never drop a column and deploy code that references it in the same deployment.

---

## Queries

### Always parameterize — never concatenate

```js
// ✓ Safe: parameterized query
const user = await db('users').where({ id: userId }).first();

// ✓ Safe: raw SQL with bindings
const rows = await db.raw('SELECT * FROM users WHERE email = ?', [email]);

// ✗ SQL injection: string concatenation
const rows = await db.raw(`SELECT * FROM users WHERE email = '${email}'`);
```

### Select only what you need

```js
// ✓ Select specific columns
await db('users').select('id', 'email', 'name').where({ id });

// ✗ SELECT * in production code — fetches columns you don't use
await db('users').where({ id });
```

### N+1 prevention

N+1 is the most common database performance bug: fetching N parent records then making N individual queries for their children.

```js
// ✗ N+1: 1 query for posts + N queries for each author
const posts = await db('posts');
for (const post of posts) {
  post.author = await db('users').where({ id: post.user_id }).first(); // N queries!
}

// ✓ Fix with JOIN
const posts = await db('posts')
  .join('users', 'posts.user_id', 'users.id')
  .select('posts.*', 'users.name as author_name', 'users.email as author_email');

// ✓ Fix with batch load (when JOIN isn't practical)
const userIds = [...new Set(posts.map(p => p.user_id))];
const users = await db('users').whereIn('id', userIds);
const userMap = Object.fromEntries(users.map(u => [u.id, u]));
for (const post of posts) {
  post.author = userMap[post.user_id];
}
```

---

## Transactions

Use transactions when multiple writes must succeed or fail together.

```js
// Knex transaction
await db.transaction(async (trx) => {
  const orderId = generateId('ord');
  await trx('orders').insert({ id: orderId, user_id: userId, total });
  await trx('order_items').insert(items.map(item => ({ ...item, order_id: orderId })));
  await trx('inventory').decrement('quantity', 1).whereIn('id', items.map(i => i.product_id));
  // If any of these throw, all changes are rolled back automatically
});

// Prisma transaction
await prisma.$transaction([
  prisma.order.create({ data: { userId, total } }),
  prisma.inventory.updateMany({ where: { id: { in: productIds } }, data: { quantity: { decrement: 1 } } }),
]);
```

Keep transactions as short as possible — long-running transactions hold locks and block other operations.

---

## Indexes

Add an index when:
- The column is used in a `WHERE` clause on a large table
- The column is a foreign key (most ORMs don't add these automatically)
- The column is used in an `ORDER BY` on a large table

```sql
-- FK indexes (always add these)
CREATE INDEX idx_posts_user_id ON posts(user_id);

-- Query column indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);

-- Composite index (order matters: most selective column first)
CREATE INDEX idx_posts_user_created ON posts(user_id, created_at DESC);
```

Don't add indexes blindly. Every index slows down writes. Add them when you have a slow query and the query plan (`EXPLAIN ANALYZE`) confirms a sequential scan.

---

## Connection Pooling

Never create a new database connection per request. Use a pool:

```js
// knex pool config
const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 2, max: 10 },   // max = typical Heroku/Railway limit
});

// Prisma uses a pool automatically
// Control pool size via DATABASE_URL:
// postgresql://user:pass@host/db?connection_limit=10
```

---

## Test Fixtures and Seeding

```js
// seeds/test_data.js (Knex)
exports.seed = async (knex) => {
  await knex('users').del();
  await knex('users').insert([
    { id: 'usr_test1', email: 'alice@test.com', name: 'Alice' },
    { id: 'usr_test2', email: 'bob@test.com',   name: 'Bob' },
  ]);
};

// Run seeds
// npx knex seed:run
```

For test isolation, prefer inserting test data inside each test with `afterEach` cleanup over a global seed:

```js
let testUser;
beforeEach(async () => {
  testUser = await db('users').insert({ id: generateId('usr'), email: 'test@test.com', name: 'Test' }).returning('*');
});
afterEach(async () => {
  await db('users').where({ id: testUser.id }).del();
});
```

---

## Safety Checklist

Before any database code ships:

- [ ] All queries use parameterized values (no string concatenation)
- [ ] Multi-step writes wrapped in a transaction
- [ ] All migrations have a `down` function
- [ ] Foreign keys declared and indexed
- [ ] No `SELECT *` in application code
- [ ] N+1 queries identified and fixed (check with query logging enabled)
- [ ] Connection pool configured (not per-request connections)
- [ ] No schema changes deployed without a migration
- [ ] Migration tested on a copy of production data before release
- [ ] Sensitive columns (passwords, tokens) are hashed/encrypted, never plaintext
