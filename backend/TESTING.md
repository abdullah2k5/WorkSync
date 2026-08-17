# Backend Tests

The backend suite uses Node's built-in `node:test` runner and Supertest. Tests import the Express app without opening a listening port and use a temporary SQLite database selected through `DATABASE_PATH`.

## Commands

From `backend/`:

```text
npm test
npm run test:watch
npm run test:coverage
```

The test database is created under the operating system temporary directory and is removed when the test process exits. The development database is never used by the suite.

Coverage uses Node's built-in experimental test coverage reporter. The current suite remains intentionally integration-focused in `workflows.test.js`; future extraction should preserve the shared isolated-database setup rather than introduce a second fixture system.

## Adding Tests

Add a `*.test.js` file under `backend/test/`. Set `DATABASE_PATH` before importing `app.js`, use the helpers and patterns in `workflows.test.js`, and create all users and tasks inside the isolated database. Do not use development IDs or development credentials.