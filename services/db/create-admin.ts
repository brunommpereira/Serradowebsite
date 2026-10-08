/**
 * Cria uma conta de administração, ou repõe a password e o papel de admin de uma conta que já exista.
 *   node db/create-admin.ts <email> "<nome>"
 * A password vem de ADMIN_PASSWORD (12 caracteres ou mais). Sem ela, é gerada e mostrada uma única vez.
 */
import { randomBytes } from 'node:crypto';
import { createPool, tx, type Pool } from '../shared/db.ts';
import { hashPassword } from '../shared/password.ts';

export async function createAdmin(pool: Pool, email: string, name: string, password: string): Promise<string> {
  email = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Email inválido: ${email}`);
  if (!name.trim()) throw new Error('Falta o nome');
  if (password.length < 12) throw new Error('A password tem de ter pelo menos 12 caracteres');
  const hash = await hashPassword(password);
  return tx(pool, async (c) => {
    const { rows } = await c.query(
      `insert into users (email, name, password_hash) values ($1, $2, $3)
       on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash, disabled = false
       returning id`,
      [email, name.trim(), hash],
    );
    const id: string = rows[0].id;
    await c.query(`insert into user_roles values ($1, 'admin') on conflict do nothing`, [id]);
    await c.query(`insert into audit_log (actor_id, action, entity, entity_id, details) values (null, 'users.create_admin', 'users', $1, $2)`, [id, { via: 'cli', email }]);
    return id;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [email, name] = process.argv.slice(2);
  if (!email || !name) {
    console.error('Uso: node db/create-admin.ts <email> "<nome>"');
    process.exit(1);
  }
  const generated = !process.env['ADMIN_PASSWORD'];
  const password = process.env['ADMIN_PASSWORD'] || randomBytes(12).toString('base64url');
  const pool = createPool();
  try {
    await createAdmin(pool, email, name, password);
    console.log(`✔ conta de administração: ${email.trim().toLowerCase()}`);
    if (generated) console.log(`  password (guarda-a já, não volta a ser mostrada): ${password}`);
  } finally {
    await pool.end();
  }
}
