// מחירון: המוצרים והשירותים של האולפן, שעליהם מבוסס התמחור
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { all, first, run, uid, must, fail } from '../lib/db'
import { body, str, int, oneOf, bool } from '../lib/validate'
import type { Product } from '../../shared/types'

const UNITS = ['hour', 'song', 'project', 'day', 'unit'] as const

export const products = new Hono<AppEnv>()

products.get('/', async c => c.json(await all<Product>(c.env.DB,
  `SELECT p.*, (SELECT COUNT(*) FROM charges WHERE product_id = p.id) AS used FROM products p
   ${c.req.query('all') === '1' ? '' : 'WHERE p.active = 1'} ORDER BY p.active DESC, p.sort, p.category, p.name`)))

products.post('/', async c => {
  const b = await body(c.req.raw)
  const id = uid()
  const max = await first<{ m: number }>(c.env.DB, `SELECT COALESCE(MAX(sort),0) AS m FROM products`)
  await run(c.env.DB, `INSERT INTO products (id, name, category, unit, price, description, sort) VALUES (?,?,?,?,?,?,?)`,
    id, str(b, 'name', { required: true, max: 120 }), str(b, 'category', { max: 60 }), oneOf(b, 'unit', UNITS, 'unit'),
    int(b, 'price', { required: true, min: 0, max: 100_000_000 }), str(b, 'description', { max: 500 }), (max?.m ?? 0) + 1)
  return c.json(await first<Product>(c.env.DB, `SELECT * FROM products WHERE id = ?`, id), 201)
})

products.patch('/:id', async c => {
  const id = c.req.param('id')
  must(await first(c.env.DB, `SELECT id FROM products WHERE id = ?`, id), 'הפריט לא נמצא')
  const b = await body(c.req.raw)
  const sets: string[] = []; const vals: unknown[] = []
  const put = (k: string, v: unknown) => { if (k in b) { sets.push(`${k} = ?`); vals.push(v) } }
  put('name', str(b, 'name', { required: 'name' in b, max: 120 }))
  put('category', str(b, 'category', { max: 60 }))
  if ('unit' in b) put('unit', oneOf(b, 'unit', UNITS))
  if ('price' in b) put('price', int(b, 'price', { required: true, min: 0, max: 100_000_000 }))
  put('description', str(b, 'description', { max: 500 }))
  if ('active' in b) put('active', bool(b, 'active') ? 1 : 0)
  if (!sets.length) fail(400, 'אין מה לעדכן')
  await run(c.env.DB, `UPDATE products SET ${sets.join(', ')} WHERE id = ?`, ...vals, id)
  return c.json(await first<Product>(c.env.DB, `SELECT * FROM products WHERE id = ?`, id))
})

/** מחיקה. פריט שכבר חויב בו מוסתר במקום להימחק, כדי לשמור על ההיסטוריה */
products.delete('/:id', async c => {
  const id = c.req.param('id')
  const used = await first<{ n: number }>(c.env.DB, `SELECT COUNT(*) AS n FROM charges WHERE product_id = ?`, id)
  if (used?.n) { await run(c.env.DB, `UPDATE products SET active = 0 WHERE id = ?`, id); return c.json({ ok: true, archived: true }) }
  await run(c.env.DB, `DELETE FROM products WHERE id = ?`, id)
  return c.json({ ok: true, archived: false })
})
