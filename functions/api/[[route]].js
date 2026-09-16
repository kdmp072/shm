/* Cloudflare Pages Functions — SATU file untuk semua endpoint /api/*
 * Binding D1 bernama "DB" (diatur di dashboard: Pages → Settings → Functions → D1).
 *
 *   GET    /api/dates                  → daftar tanggal tersimpan
 *   GET    /api/bars?date=YYYY-MM-DD   → seluruh baris 1 tanggal
 *   GET    /api/bars?from=A&to=B       → rentang tanggal (maks 62 hari)
 *   POST   /api/upload                 → {trade_date, rows[]} batch upsert (maks 1500/request)
 *   POST   /api/upload-complete        → {trade_date, row_count, source_file}
 *   DELETE /api/date?date=YYYY-MM-DD   → hapus 1 tanggal
 */
const F = ['name','remarks','prev','open','first','high','low','close','chg','vol','val','freq',
  'offer','offerVol','bid','bidVol','listed','tradeable','weight',
  'fsell','fbuy','nrVol','nrVal','nrFreq','idxInd'];
const q = n => '"' + n + '"';
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const ok = data => Response.json({ ok: true, ...data });
const fail = (error, status = 400) => Response.json({ ok: false, error }, { status });
const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
const txt = v => (v === null || v === undefined) ? null : String(v).slice(0, 200);

export async function onRequest({ request, env }) {
  if (!env.DB) return fail('Binding D1 "DB" belum dipasang (Pages → Settings → Functions → D1).', 500);
  const url = new URL(request.url);
  const seg = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const m = request.method.toUpperCase();
  try {
    if (m === 'GET' && seg === 'dates') {
      const r = await env.DB.prepare(
        'SELECT "trade_date","row_count","uploaded_at","source_file" FROM "trading_days" ORDER BY "trade_date" DESC'
      ).all();
      return ok({ data: r.results || [] });
    }
    if (m === 'GET' && seg === 'bars') {
      const dt = url.searchParams.get('date');
      const from = url.searchParams.get('from'), to = url.searchParams.get('to');
      let where = '', args = [];
      if (dt) {
        if (!isDate(dt)) return fail('param date tidak valid');
        where = 'WHERE "trade_date"=?'; args = [dt];
      } else if (from && to) {
        if (!isDate(from) || !isDate(to)) return fail('param from/to tidak valid');
        if ((new Date(to) - new Date(from)) / 864e5 > 62) return fail('rentang maks 62 hari');
        where = 'WHERE "trade_date" BETWEEN ? AND ?'; args = [from, to];
      } else return fail('butuh ?date= atau ?from=&to=');
      const r = await env.DB.prepare(
        `SELECT * FROM "daily_bars" ${where} ORDER BY "trade_date","code"`
      ).bind(...args).all();
      const days = await env.DB.prepare(
        `SELECT "trade_date","source_file" FROM "trading_days" ${where}`
      ).bind(...args).all();
      const src = {}; (days.results || []).forEach(x => src[x.trade_date] = x.source_file);
      const data = {};
      (r.results || []).forEach(row => {
        const t = row.trade_date;
        if (!data[t]) data[t] = { rows: [], source: src[t] || 'Database', demo: false };
        delete row.trade_date;
        data[t].rows.push(row);
      });
      return ok({ data });
    }
    if (m === 'POST' && seg === 'upload') {
      const body = await request.json().catch(() => null);
      if (!body || !isDate(body.trade_date)) return fail('trade_date tidak valid');
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return fail('rows kosong');
      if (rows.length > 1500) return fail('maks 1500 baris per request');
      const cols = ['trade_date', 'code', ...F];
      const sql = `INSERT INTO "daily_bars" (${cols.map(q).join(',')}) VALUES (${cols.map(() => '?').join(',')}) ` +
        `ON CONFLICT("trade_date","code") DO UPDATE SET ${F.map(f => `${q(f)}=excluded.${q(f)}`).join(',')}`;
      const stmts = [];
      for (const r of rows) {
        const code = String(r.code || '').trim().toUpperCase().slice(0, 12);
        if (!code) continue;
        stmts.push(env.DB.prepare(sql).bind(
          body.trade_date, code, txt(r.name), txt(r.remarks),
          num(r.prev), num(r.open), num(r.first), num(r.high), num(r.low), num(r.close),
          num(r.chg), num(r.vol), num(r.val), num(r.freq),
          num(r.offer), num(r.offerVol), num(r.bid), num(r.bidVol),
          num(r.listed), num(r.tradeable), num(r.weight),
          num(r.fsell), num(r.fbuy),
          num(r.nrVol), num(r.nrVal), num(r.nrFreq),
          num(r.idxInd)
        ));
      }
      if (!stmts.length) return fail('tidak ada baris valid');
      await env.DB.batch(stmts);
      return ok({ saved: stmts.length });
    }
    if (m === 'POST' && seg === 'upload-complete') {
      const body = await request.json().catch(() => null);
      if (!body || !isDate(body.trade_date)) return fail('trade_date tidak valid');
      await env.DB.prepare(
        'INSERT INTO "trading_days" ("trade_date","uploaded_at","row_count","source_file") VALUES (?,?,?,?) ' +
        'ON CONFLICT("trade_date") DO UPDATE SET "uploaded_at"=excluded."uploaded_at",' +
        '"row_count"=excluded."row_count","source_file"=excluded."source_file"'
      ).bind(body.trade_date, new Date().toISOString(), body.row_count | 0, txt(body.source_file)).run();
      return ok({});
    }
    if (m === 'DELETE' && seg === 'date') {
      const dt = url.searchParams.get('date');
      if (!isDate(dt)) return fail('param date tidak valid');
      const a = await env.DB.prepare('DELETE FROM "daily_bars" WHERE "trade_date"=?').bind(dt).run();
      await env.DB.prepare('DELETE FROM "trading_days" WHERE "trade_date"=?').bind(dt).run();
      return ok({ deleted: (a.meta || {}).changes || 0 });
    }
    return fail('endpoint tidak dikenal', 404);
  } catch (e) { return fail('server: ' + (e && e.message ? e.message : e), 500); }
}
