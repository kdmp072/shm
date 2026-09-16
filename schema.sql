-- Skema D1 untuk IDX Screener
-- Cara pakai: Cloudflare Dashboard → D1 → database idxdb → Console → paste seluruh file → Execute.
CREATE TABLE IF NOT EXISTS trading_days (
  trade_date  TEXT PRIMARY KEY,   -- 'YYYY-MM-DD'
  uploaded_at TEXT NOT NULL,
  row_count   INTEGER NOT NULL,
  source_file TEXT
);

CREATE TABLE IF NOT EXISTS daily_bars (
  trade_date TEXT NOT NULL,
  code       TEXT NOT NULL,
  name       TEXT,
  remarks    TEXT,
  prev       REAL,
  open       REAL,
  first      REAL,
  high       REAL,
  low        REAL,
  close      REAL,
  chg        REAL,
  vol        REAL,
  val        REAL,
  freq       REAL,
  offer      REAL,
  offerVol   REAL,
  bid        REAL,
  bidVol     REAL,
  listed     REAL,
  tradeable  REAL,
  weight     REAL,
  fsell      REAL,
  fbuy       REAL,
  nrVol      REAL,
  nrVal      REAL,
  nrFreq     REAL,
  idxInd     REAL,
  PRIMARY KEY (trade_date, code)
);

CREATE INDEX IF NOT EXISTS idx_bars_code_date ON daily_bars(code, trade_date);
