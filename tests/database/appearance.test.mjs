import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { getDatabaseTestStatus, databaseTestTarget } from './environment.mjs';

if (databaseTestTarget() !== 'development')
  throw new Error('Appearance contracts only run against disposable development.');
const local = getDatabaseTestStatus();
const db = new pg.Client({ connectionString: local.DB_URL });
before(async () => {
  await db.connect();
});
after(async () => {
  await db.end();
});

async function transaction(run) {
  await db.query('BEGIN');
  try {
    await run();
  } finally {
    await db.query('ROLLBACK');
  }
}

async function settingsId() {
  const { rows } = await db.query('SELECT id FROM public.tenant_settings LIMIT 1 FOR UPDATE');
  if (rows.length) return rows[0].id;
  const id = randomUUID();
  await db.query('INSERT INTO public.tenant_settings (id) VALUES ($1)', [id]);
  return id;
}

test('appearance migration defaults preserve the existing interface', async () => {
  const { rows } =
    await db.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tenant_settings'
    AND column_name IN ('heading_font_family','button_shape','public_home_title','public_home_description','public_home_background','login_background','register_background')`);
  assert.equal(rows.length, 7);
  assert.ok(rows.every((row) => row.is_nullable === 'YES'));
  assert.equal(rows.find((row) => row.column_name === 'login_background').data_type, 'jsonb');
});

test('saving, clearing and copying one background never updates another screen', async () =>
  transaction(async () => {
    const id = await settingsId();
    await db.query(
      `UPDATE public.tenant_settings SET
    public_home_background=$2, login_background=$3, register_background=NULL WHERE id=$1`,
      [id, { mode: 'color', color: '#123456' }, { mode: 'color', color: '#abcdef' }],
    );
    let { rows } = await db.query(
      'SELECT public_home_background,login_background,register_background FROM public.tenant_settings WHERE id=$1',
      [id],
    );
    assert.deepEqual(rows[0], {
      public_home_background: { mode: 'color', color: '#123456' },
      login_background: { mode: 'color', color: '#abcdef' },
      register_background: null,
    });
    await db.query(
      'UPDATE public.tenant_settings SET register_background=login_background,login_background=NULL WHERE id=$1',
      [id],
    );
    ({ rows } = await db.query(
      'SELECT public_home_background,login_background,register_background FROM public.tenant_settings WHERE id=$1',
      [id],
    ));
    assert.deepEqual(rows[0], {
      public_home_background: { mode: 'color', color: '#123456' },
      login_background: null,
      register_background: { mode: 'color', color: '#abcdef' },
    });
  }));

test('appearance constraints reject unsupported fonts, buttons and background values', async () => {
  for (const patch of [
    "button_shape='unsafe'",
    "heading_font_family='url(font)'",
    'login_background=\'"invalid"\'::jsonb',
    "register_background='{}'::jsonb",
    'public_home_background=\'{"mode":"image","imageUrl":"/x.png","position":"center","overlayOpacity":101}\'::jsonb',
  ]) {
    await transaction(async () => {
      const id = await settingsId();
      await assert.rejects(
        db.query(`UPDATE public.tenant_settings SET ${patch} WHERE id=$1`, [id]),
        (error) => error.code === '23514',
      );
    });
  }
});

test('only active administrators can read and update appearance settings directly', async () =>
  transaction(async () => {
    const id = await settingsId();
    const userId = randomUUID();
    await db.query(
      'INSERT INTO auth.users (id,email,raw_user_meta_data,raw_app_meta_data) VALUES ($1,$2,$3,$4)',
      [userId, `${userId}@example.test`, {}, {}],
    );
    await db.query("UPDATE public.profiles SET role='user',status='active' WHERE id=$1", [userId]);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [userId]);
    await db.query('SET LOCAL ROLE authenticated');
    assert.equal(
      (await db.query('SELECT id FROM public.tenant_settings WHERE id=$1', [id])).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "UPDATE public.tenant_settings SET button_shape='pill' WHERE id=$1 RETURNING id",
          [id],
        )
      ).rows.length,
      0,
    );
    await db.query('RESET ROLE');
    await db.query("UPDATE public.profiles SET role='admin' WHERE id=$1", [userId]);
    await db.query('SET LOCAL ROLE authenticated');
    assert.equal(
      (
        await db.query(
          "UPDATE public.tenant_settings SET button_shape='pill' WHERE id=$1 RETURNING id",
          [id],
        )
      ).rows.length,
      1,
    );
    await db.query('RESET ROLE');
    await db.query("UPDATE public.profiles SET status='suspended' WHERE id=$1", [userId]);
    await db.query('SET LOCAL ROLE authenticated');
    assert.equal(
      (
        await db.query(
          "UPDATE public.tenant_settings SET button_shape='square' WHERE id=$1 RETURNING id",
          [id],
        )
      ).rows.length,
      0,
    );
    await db.query('RESET ROLE');
    await db.query('SET LOCAL ROLE anon');
    await assert.rejects(
      db.query('SELECT id FROM public.tenant_settings'),
      (error) => error.code === '42501',
    );
  }));
