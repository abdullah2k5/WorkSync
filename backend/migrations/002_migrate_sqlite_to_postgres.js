/**
 * WorkSync — SQLite → PostgreSQL Data Migration
 * ===============================================
 *
 * Migrates application data from:
 *   %APPDATA%\WorkSync\database\worksync.sqlite
 *
 * into:
 *   PostgreSQL database: worksync
 *
 * IMPORTANT:
 * - SQLite is opened read-only.
 * - PostgreSQL migration happens inside one transaction.
 * - Existing PostgreSQL data causes the migration to abort.
 * - SQLite is never modified.
 * - Explicit IDs are preserved.
 * - Password hashes are preserved exactly.
 */

const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { Client } = require('pg');

// ---------------------------------------------------------------------------
// Load .env explicitly
// ---------------------------------------------------------------------------

require('dotenv').config({
  path: path.join(__dirname, '..', '..', '.env'),
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SQLITE_DB_PATH =
  process.env.WORKSYNC_SQLITE_DB ||
  path.join(
    process.env.APPDATA,
    'WorkSync',
    'database',
    'worksync.sqlite'
  );

const PG_CONFIG = {
  host: process.env.PGHOST || process.env.PG_HOST || 'localhost',
  port: Number(process.env.PGPORT || process.env.PG_PORT || 5432),
  database: process.env.PGDATABASE || process.env.PG_DATABASE || 'worksync',
  user: process.env.PGUSER || process.env.PG_USER || 'postgres',
  password:
    process.env.PGPASSWORD ||
    process.env.PG_PASSWORD ||
    undefined,
};

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const ALL_TABLES = [
  'departments',
  'users',
  'employees',
  'labels',
  'tasks',
  'leave_requests',
  'announcements',
  'notifications',
  'notification_preferences',
  'employee_imports',
  'task_activity',
  'task_attachments',
  'task_blockers',
  'task_comments',
  'task_labels',
  'task_subtasks',
];

// Tables with a single integer identity `id` column.
const IDENTITY_TABLES = [
  'announcements',
  'departments',
  'employee_imports',
  'employees',
  'labels',
  'leave_requests',
  'notifications',
  'task_activity',
  'task_attachments',
  'task_blockers',
  'task_comments',
  'task_subtasks',
  'tasks',
  'users',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function columnsOf(db, table) {
  return db
    .prepare(`PRAGMA table_info("${table}")`)
    .all()
    .map((column) => column.name);
}

function tableExists(db, table) {
  const row = db
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
       AND name = ?`
    )
    .get(table);

  return !!row;
}

function readAll(db, table, columns) {
  const quotedColumns = columns
    .map((column) => `"${column.replace(/"/g, '""')}"`)
    .join(', ');

  return db
    .prepare(`SELECT ${quotedColumns} FROM "${table}"`)
    .all()
    .map((row) => {
      const output = {};

      for (const column of columns) {
        output[column] = row[column];
      }

      return output;
    });
}

function toPg(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return value;
}

function buildInsert(table, columns) {
  const columnList = columns
    .map((column) => `"${column}"`)
    .join(', ');

  const placeholders = columns
    .map((_, index) => `$${index + 1}`)
    .join(', ');

  return `
    INSERT INTO "${table}" (${columnList})
    VALUES (${placeholders})
  `;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('==============================================');
  console.log(' WorkSync SQLite → PostgreSQL Migration');
  console.log('==============================================');

  console.log('\n[migrate] PostgreSQL configuration:');
  console.log(`  Host:     ${PG_CONFIG.host}`);
  console.log(`  Port:     ${PG_CONFIG.port}`);
  console.log(`  Database: ${PG_CONFIG.database}`);
  console.log(`  User:     ${PG_CONFIG.user}`);
  console.log(`  Password: ${PG_CONFIG.password ? '[loaded]' : '[MISSING]'}`);

  if (!PG_CONFIG.password) {
    throw new Error(
      'PostgreSQL password is missing. Make sure PGPASSWORD exists in backend/.env.'
    );
  }

  // -------------------------------------------------------------------------
  // 1. Open SQLite read-only
  // -------------------------------------------------------------------------

  const sqlite = new DatabaseSync(SQLITE_DB_PATH, {
    readOnly: true,
  });

  console.log(
    '\n[migrate] Opened SQLite read-only:',
    SQLITE_DB_PATH
  );

  try {
    // -----------------------------------------------------------------------
    // 2. Verify SQLite source tables
    // -----------------------------------------------------------------------

    console.log('\n[migrate] Checking SQLite source tables...');

    const missingTables = ALL_TABLES.filter(
      (table) => !tableExists(sqlite, table)
    );

    if (missingTables.length > 0) {
      throw new Error(
        `SQLite is missing required tables: ${missingTables.join(', ')}`
      );
    }

    console.log('[migrate] All required SQLite tables exist.');

    // -----------------------------------------------------------------------
    // 3. Connect PostgreSQL
    // -----------------------------------------------------------------------

    const client = new Client(PG_CONFIG);

    await client.connect();

    console.log('[migrate] Connected to PostgreSQL.');

    try {
      // ---------------------------------------------------------------------
      // 4. Verify PostgreSQL tables exist
      // ---------------------------------------------------------------------

      console.log('\n[migrate] Checking PostgreSQL target tables...');

      for (const table of ALL_TABLES) {
        const result = await client.query(
          `
          SELECT to_regclass($1) AS table_name
          `,
          [`public.${table}`]
        );

        if (!result.rows[0].table_name) {
          throw new Error(
            `PostgreSQL table "${table}" does not exist. ` +
            'Run 001_create_postgres_schema.sql first.'
          );
        }
      }

      console.log('[migrate] All PostgreSQL target tables exist.');

      // ---------------------------------------------------------------------
      // 5. Confirm PostgreSQL database is empty
      // ---------------------------------------------------------------------

      console.log('\n[migrate] Checking PostgreSQL tables are empty...');

      for (const table of ALL_TABLES) {
        const result = await client.query(
          `SELECT COUNT(*)::int AS count FROM "${table}"`
        );

        const count = result.rows[0].count;

        if (count > 0) {
          throw new Error(
            `PostgreSQL table "${table}" already contains ${count} rows. ` +
            'Migration aborted to prevent duplicate data.'
          );
        }
      }

      console.log('[migrate] PostgreSQL tables confirmed empty.');

      // ---------------------------------------------------------------------
      // 6. Begin transaction
      // ---------------------------------------------------------------------

      await client.query('BEGIN');

      console.log('[migrate] PostgreSQL transaction started.');

      const migrated = {};

      // ---------------------------------------------------------------------
      // departments
      // ---------------------------------------------------------------------

      {
        const columns = columnsOf(sqlite, 'departments');
        const rows = readAll(sqlite, 'departments', columns);
        const insert = buildInsert('departments', columns);

        for (const row of rows) {
          await client.query(
            insert,
            columns.map((column) => toPg(row[column]))
          );
        }

        migrated.departments = rows.length;

        console.log(
          `[migrate] departments: ${rows.length} rows`
        );
      }

      // ---------------------------------------------------------------------
      // users
      // ---------------------------------------------------------------------

      {
        const columns = columnsOf(sqlite, 'users');
        const rows = readAll(sqlite, 'users', columns);
        const insert = buildInsert('users', columns);

        for (const row of rows) {
          await client.query(
            insert,
            columns.map((column) => toPg(row[column]))
          );
        }

        migrated.users = rows.length;

        console.log(
          `[migrate] users: ${rows.length} rows`
        );
      }

      // ---------------------------------------------------------------------
      // employees
      // ---------------------------------------------------------------------
      // employees.manager_id references employees.id.
      // Therefore migrate managers before their subordinates.
      // ---------------------------------------------------------------------

      {
        const columns = columnsOf(sqlite, 'employees');
        const rows = readAll(sqlite, 'employees', columns);

        const done = new Set();
        const ordered = [];

        while (ordered.length < rows.length) {
          let progressed = false;

          for (const row of rows) {
            if (done.has(row.id)) {
              continue;
            }

            const managerId = row.manager_id;

            if (
              managerId === null ||
              managerId === undefined ||
              done.has(managerId)
            ) {
              ordered.push(row);
              done.add(row.id);
              progressed = true;
            }
          }

          if (!progressed) {
            const unresolved = rows
              .filter((row) => !done.has(row.id))
              .map((row) => row.id);

            throw new Error(
              'Circular or orphaned manager reference among employees. ' +
              `Unresolved employee IDs: ${JSON.stringify(unresolved)}`
            );
          }
        }

        const insert = buildInsert('employees', columns);

        for (const row of ordered) {
          await client.query(
            insert,
            columns.map((column) => toPg(row[column]))
          );
        }

        migrated.employees = ordered.length;

        console.log(
          `[migrate] employees: ${ordered.length} rows`
        );
      }

      // ---------------------------------------------------------------------
      // labels
      // ---------------------------------------------------------------------

      {
        const columns = columnsOf(sqlite, 'labels');
        const rows = readAll(sqlite, 'labels', columns);
        const insert = buildInsert('labels', columns);

        for (const row of rows) {
          await client.query(
            insert,
            columns.map((column) => toPg(row[column]))
          );
        }

        migrated.labels = rows.length;

        console.log(
          `[migrate] labels: ${rows.length} rows`
        );
      }

      // ---------------------------------------------------------------------
      // tasks
      // ---------------------------------------------------------------------

      {
        const columns = columnsOf(sqlite, 'tasks');
        const rows = readAll(sqlite, 'tasks', columns);
        const insert = buildInsert('tasks', columns);

        for (const row of rows) {
          await client.query(
            insert,
            columns.map((column) => toPg(row[column]))
          );
        }

        migrated.tasks = rows.length;

        console.log(
          `[migrate] tasks: ${rows.length} rows`
        );
      }

      // ---------------------------------------------------------------------
      // announcements
      // ---------------------------------------------------------------------

      {
        const columns = columnsOf(sqlite, 'announcements');
        const rows = readAll(sqlite, 'announcements', columns);
        const insert = buildInsert('announcements', columns);

        for (const row of rows) {
          await client.query(
            insert,
            columns.map((column) => toPg(row[column]))
          );
        }

        migrated.announcements = rows.length;

        console.log(
          `[migrate] announcements: ${rows.length} rows`
        );
      }

      // ---------------------------------------------------------------------
      // leave_requests
      // ---------------------------------------------------------------------

      {
        const columns = columnsOf(sqlite, 'leave_requests');
        const rows = readAll(sqlite, 'leave_requests', columns);
        const insert = buildInsert('leave_requests', columns);

        for (const row of rows) {
          await client.query(
            insert,
            columns.map((column) => toPg(row[column]))
          );
        }

        migrated.leave_requests = rows.length;

        console.log(
          `[migrate] leave_requests: ${rows.length} rows`
        );
      }

      // ---------------------------------------------------------------------
      // notifications
      // ---------------------------------------------------------------------

      {
        const columns = columnsOf(sqlite, 'notifications');
        const rows = readAll(sqlite, 'notifications', columns);
        const insert = buildInsert('notifications', columns);

        for (const row of rows) {
          await client.query(
            insert,
            columns.map((column) => toPg(row[column]))
          );
        }

        migrated.notifications = rows.length;

        console.log(
          `[migrate] notifications: ${rows.length} rows`
        );
      }

      // ---------------------------------------------------------------------
      // notification_preferences
      // ---------------------------------------------------------------------

      {
        const columns = columnsOf(
          sqlite,
          'notification_preferences'
        );

        const rows = readAll(
          sqlite,
          'notification_preferences',
          columns
        );

        const insert = buildInsert(
          'notification_preferences',
          columns
        );

        for (const row of rows) {
          await client.query(
            insert,
            columns.map((column) => toPg(row[column]))
          );
        }

        migrated.notification_preferences = rows.length;

        console.log(
          `[migrate] notification_preferences: ${rows.length} rows`
        );
      }

      // ---------------------------------------------------------------------
      // employee_imports
      // ---------------------------------------------------------------------

      {
        const columns = columnsOf(
          sqlite,
          'employee_imports'
        );

        const rows = readAll(
          sqlite,
          'employee_imports',
          columns
        );

        const insert = buildInsert(
          'employee_imports',
          columns
        );

        for (const row of rows) {
          await client.query(
            insert,
            columns.map((column) => toPg(row[column]))
          );
        }

        migrated.employee_imports = rows.length;

        console.log(
          `[migrate] employee_imports: ${rows.length} rows`
        );
      }

      // ---------------------------------------------------------------------
      // Task child tables
      // ---------------------------------------------------------------------

      const childTables = [
        'task_activity',
        'task_attachments',
        'task_comments',
        'task_blockers',
        'task_subtasks',
        'task_labels',
      ];

      for (const table of childTables) {
        const columns = columnsOf(sqlite, table);
        const rows = readAll(sqlite, table, columns);
        const insert = buildInsert(table, columns);

        for (const row of rows) {
          await client.query(
            insert,
            columns.map((column) => toPg(row[column]))
          );
        }

        migrated[table] = rows.length;

        console.log(
          `[migrate] ${table}: ${rows.length} rows`
        );
      }

      // ---------------------------------------------------------------------
      // Identity sequences
      // ---------------------------------------------------------------------

      console.log('\n[migrate] Updating identity sequences...');

      for (const table of IDENTITY_TABLES) {
        const maxResult = await client.query(
          `SELECT MAX(id) AS max_id FROM "${table}"`
        );

        const maxId = maxResult.rows[0].max_id;

        const sequenceResult = await client.query(
          `SELECT pg_get_serial_sequence($1, 'id') AS seq`,
          [table]
        );

        const sequenceName = sequenceResult.rows[0].seq;

        if (!sequenceName) {
          console.warn(
            `[migrate] Warning: no identity sequence found for ${table}`
          );

          continue;
        }

        if (maxId === null) {
          // Empty table:
          // next generated ID must be 1.
          await client.query(
            `SELECT setval($1, 1, false)`,
            [sequenceName]
          );

          console.log(
            `[migrate] ${table}: sequence reset for first ID = 1`
          );
        } else {
          // Existing migrated IDs:
          // next generated ID becomes maxId + 1.
          await client.query(
            `SELECT setval($1, $2, true)`,
            [sequenceName, maxId]
          );

          console.log(
            `[migrate] ${table}: sequence set after ID ${maxId}`
          );
        }
      }

      // ---------------------------------------------------------------------
      // Commit
      // ---------------------------------------------------------------------

      await client.query('COMMIT');

      console.log(
        '\n[migrate] PostgreSQL transaction committed successfully.'
      );

      // ---------------------------------------------------------------------
      // Verification
      // ---------------------------------------------------------------------

      console.log('\n==============================================');
      console.log(' VERIFICATION');
      console.log('==============================================');

      let allMatch = true;

      // ---------------------------------------------------------------------
      // Row counts
      // ---------------------------------------------------------------------

      console.log('\n=== Row counts ===');

      for (const table of ALL_TABLES) {
        const sqliteResult = sqlite
          .prepare(`SELECT COUNT(*) AS count FROM "${table}"`)
          .get();

        const pgResult = await client.query(
          `SELECT COUNT(*)::int AS count FROM "${table}"`
        );

        const sqliteCount = Number(sqliteResult.count);
        const pgCount = Number(pgResult.rows[0].count);

        const match = sqliteCount === pgCount;

        if (!match) {
          allMatch = false;
        }

        console.log(
          `${table.padEnd(28)} ` +
          `SQLite=${String(sqliteCount).padStart(5)} ` +
          `PostgreSQL=${String(pgCount).padStart(5)} ` +
          `${match ? 'MATCH' : 'MISMATCH'}`
        );
      }

      // ---------------------------------------------------------------------
      // Min/max IDs
      // ---------------------------------------------------------------------

      console.log('\n=== Min/Max ID comparison ===');

      for (const table of IDENTITY_TABLES) {
        const sqliteResult = sqlite
          .prepare(
            `SELECT MIN(id) AS min_id, MAX(id) AS max_id FROM "${table}"`
          )
          .get();

        const pgResult = await client.query(
          `SELECT MIN(id) AS min_id, MAX(id) AS max_id FROM "${table}"`
        );

        const sqliteMin =
          sqliteResult.min_id === null
            ? null
            : Number(sqliteResult.min_id);

        const sqliteMax =
          sqliteResult.max_id === null
            ? null
            : Number(sqliteResult.max_id);

        const pgMin =
          pgResult.rows[0].min_id === null
            ? null
            : Number(pgResult.rows[0].min_id);

        const pgMax =
          pgResult.rows[0].max_id === null
            ? null
            : Number(pgResult.rows[0].max_id);

        const match =
          sqliteMin === pgMin &&
          sqliteMax === pgMax;

        if (!match) {
          allMatch = false;
        }

        console.log(
          `${table.padEnd(24)} ` +
          `SQLite[${sqliteMin ?? 'NULL'}..${sqliteMax ?? 'NULL'}] ` +
          `PG[${pgMin ?? 'NULL'}..${pgMax ?? 'NULL'}] ` +
          `${match ? 'OK' : 'MISMATCH'}`
        );
      }

      // ---------------------------------------------------------------------
      // Foreign-key integrity
      // ---------------------------------------------------------------------

      console.log('\n=== Foreign-key integrity ===');

      const fkQueries = {
        'employees.user_id':
          `
          SELECT COUNT(*)::int AS c
          FROM employees e
          LEFT JOIN users u ON u.id = e.user_id
          WHERE u.id IS NULL
          `,

        'employees.department_id':
          `
          SELECT COUNT(*)::int AS c
          FROM employees e
          LEFT JOIN departments d ON d.id = e.department_id
          WHERE e.department_id IS NOT NULL
          AND d.id IS NULL
          `,

        'employees.manager_id':
          `
          SELECT COUNT(*)::int AS c
          FROM employees e
          LEFT JOIN employees m ON m.id = e.manager_id
          WHERE e.manager_id IS NOT NULL
          AND m.id IS NULL
          `,

        'tasks.assigned_to':
          `
          SELECT COUNT(*)::int AS c
          FROM tasks t
          LEFT JOIN employees e ON e.id = t.assigned_to
          WHERE e.id IS NULL
          `,

        'tasks.created_by':
          `
          SELECT COUNT(*)::int AS c
          FROM tasks t
          LEFT JOIN employees e ON e.id = t.created_by
          WHERE e.id IS NULL
          `,

        'announcements.created_by':
          `
          SELECT COUNT(*)::int AS c
          FROM announcements a
          LEFT JOIN employees e ON e.id = a.created_by
          WHERE e.id IS NULL
          `,

        'leave_requests.employee_id':
          `
          SELECT COUNT(*)::int AS c
          FROM leave_requests l
          LEFT JOIN employees e ON e.id = l.employee_id
          WHERE e.id IS NULL
          `,

        'leave_requests.reviewed_by':
          `
          SELECT COUNT(*)::int AS c
          FROM leave_requests l
          LEFT JOIN employees e ON e.id = l.reviewed_by
          WHERE l.reviewed_by IS NOT NULL
          AND e.id IS NULL
          `,

        'notifications.user_id':
          `
          SELECT COUNT(*)::int AS c
          FROM notifications n
          LEFT JOIN users u ON u.id = n.user_id
          WHERE u.id IS NULL
          `,

        'notification_preferences.user_id':
          `
          SELECT COUNT(*)::int AS c
          FROM notification_preferences np
          LEFT JOIN users u ON u.id = np.user_id
          WHERE u.id IS NULL
          `,

        'employee_imports.admin_user_id':
          `
          SELECT COUNT(*)::int AS c
          FROM employee_imports ei
          LEFT JOIN users u ON u.id = ei.admin_user_id
          WHERE u.id IS NULL
          `,

        'task_activity.task_id':
          `
          SELECT COUNT(*)::int AS c
          FROM task_activity ta
          LEFT JOIN tasks t ON t.id = ta.task_id
          WHERE t.id IS NULL
          `,

        'task_activity.actor_user_id':
          `
          SELECT COUNT(*)::int AS c
          FROM task_activity ta
          LEFT JOIN users u ON u.id = ta.actor_user_id
          WHERE u.id IS NULL
          `,

        'task_attachments.task_id':
          `
          SELECT COUNT(*)::int AS c
          FROM task_attachments ta
          LEFT JOIN tasks t ON t.id = ta.task_id
          WHERE t.id IS NULL
          `,

        'task_attachments.uploaded_by_user_id':
          `
          SELECT COUNT(*)::int AS c
          FROM task_attachments ta
          LEFT JOIN users u
            ON u.id = ta.uploaded_by_user_id
          WHERE u.id IS NULL
          `,

        'task_comments.task_id':
          `
          SELECT COUNT(*)::int AS c
          FROM task_comments tc
          LEFT JOIN tasks t ON t.id = tc.task_id
          WHERE t.id IS NULL
          `,

        'task_comments.author_user_id':
          `
          SELECT COUNT(*)::int AS c
          FROM task_comments tc
          LEFT JOIN users u ON u.id = tc.author_user_id
          WHERE u.id IS NULL
          `,

        'task_blockers.task_id':
          `
          SELECT COUNT(*)::int AS c
          FROM task_blockers tb
          LEFT JOIN tasks t ON t.id = tb.task_id
          WHERE t.id IS NULL
          `,

        'task_blockers.reported_by_user_id':
          `
          SELECT COUNT(*)::int AS c
          FROM task_blockers tb
          LEFT JOIN users u
            ON u.id = tb.reported_by_user_id
          WHERE u.id IS NULL
          `,

        'task_blockers.resolved_by_user_id':
          `
          SELECT COUNT(*)::int AS c
          FROM task_blockers tb
          LEFT JOIN users u
            ON u.id = tb.resolved_by_user_id
          WHERE tb.resolved_by_user_id IS NOT NULL
          AND u.id IS NULL
          `,

        'task_labels.task_id':
          `
          SELECT COUNT(*)::int AS c
          FROM task_labels tl
          LEFT JOIN tasks t ON t.id = tl.task_id
          WHERE t.id IS NULL
          `,

        'task_labels.label_id':
          `
          SELECT COUNT(*)::int AS c
          FROM task_labels tl
          LEFT JOIN labels l ON l.id = tl.label_id
          WHERE l.id IS NULL
          `,

        'task_subtasks.task_id':
          `
          SELECT COUNT(*)::int AS c
          FROM task_subtasks ts
          LEFT JOIN tasks t ON t.id = ts.task_id
          WHERE t.id IS NULL
          `,

        'task_subtasks.created_by':
          `
          SELECT COUNT(*)::int AS c
          FROM task_subtasks ts
          LEFT JOIN users u ON u.id = ts.created_by
          WHERE u.id IS NULL
          `,
      };

      for (const [label, sql] of Object.entries(fkQueries)) {
        const result = await client.query(sql);
        const orphans = Number(result.rows[0].c);

        const ok = orphans === 0;

        if (!ok) {
          allMatch = false;
        }

        console.log(
          `${label.padEnd(38)} ` +
          `orphans=${orphans} ` +
          `${ok ? 'OK' : 'ORPHANS FOUND'}`
        );
      }

      // ---------------------------------------------------------------------
      // Authentication verification
      // ---------------------------------------------------------------------

      console.log('\n=== Authentication data ===');

      const sqliteUsers = sqlite
        .prepare(
          `
          SELECT
            id,
            email,
            password,
            role,
            is_active,
            must_change_password
          FROM users
          ORDER BY id
          `
        )
        .all();

      const pgUsersResult = await client.query(
        `
        SELECT
          id,
          email,
          password,
          role,
          is_active,
          must_change_password
        FROM users
        ORDER BY id
        `
      );

      const pgUsers = pgUsersResult.rows;

      const authOk =
        sqliteUsers.length === pgUsers.length &&
        sqliteUsers.every((sqliteUser, index) => {
          const pgUser = pgUsers[index];

          return (
            sqliteUser.id === pgUser.id &&
            sqliteUser.email === pgUser.email &&
            sqliteUser.password === pgUser.password &&
            sqliteUser.role === pgUser.role &&
            Number(sqliteUser.is_active) === Number(pgUser.is_active) &&
            Number(sqliteUser.must_change_password) ===
              Number(pgUser.must_change_password)
          );
        });

      if (!authOk) {
        allMatch = false;
      }

      console.log(
        `User count matched: ${sqliteUsers.length === pgUsers.length}`
      );

      console.log(
        `Emails matched: ${
          sqliteUsers.length === pgUsers.length &&
          sqliteUsers.every(
            (user, index) =>
              user.email === pgUsers[index]?.email
          )
        }`
      );

      console.log(
        `Password hashes identical: ${
          sqliteUsers.length === pgUsers.length &&
          sqliteUsers.every(
            (user, index) =>
              user.password === pgUsers[index]?.password
          )
        }`
      );

      console.log(
        `must_change_password identical: ${
          sqliteUsers.length === pgUsers.length &&
          sqliteUsers.every(
            (user, index) =>
              Number(user.must_change_password) ===
              Number(pgUsers[index]?.must_change_password)
          )
        }`
      );

      console.log(
        `Auth data overall: ${authOk ? 'PASS' : 'FAIL'}`
      );

      // ---------------------------------------------------------------------
      // Final status
      // ---------------------------------------------------------------------

      console.log('\n==============================================');
      console.log(' FINAL STATUS');
      console.log('==============================================');

      if (allMatch) {
        console.log(
          'MIGRATION: SUCCESS'
        );

        console.log(
          'All row counts, IDs, foreign keys, and authentication data match.'
        );
      } else {
        console.log(
          'MIGRATION: COMPLETED WITH WARNINGS'
        );

        console.log(
          'Review the mismatches reported above.'
        );

        process.exitCode = 1;
      }
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {
        // Ignore rollback errors.
      }

      console.error('\n==============================================');
      console.error(' MIGRATION FAILED');
      console.error('==============================================');

      console.error('Error:', err.message);

      console.error(
        'SQLite database was NOT modified.'
      );

      console.error(
        'PostgreSQL transaction was rolled back.'
      );

      process.exitCode = 1;
    } finally {
      await client.end();
    }
  } finally {
    sqlite.close();
  }
}

// ---------------------------------------------------------------------------
// Fatal error handler
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});