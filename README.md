# 盯盤哨兵

幣安 USDT 永續的研究規則說明站。規則來自交接手冊：合約 5 分 K 爆量（十項條件、同幣 90 分鐘去重），
再用爆量前 45 分到後 15 分的 13 個未平倉數字做單側 Mann-Kendall 檢定（p < 0.05）。只掃有同名現貨的永續。
舊的 P12_z278 與其頁面、資料已移除。訊號僅供參考，不是投資建議。

- 即時 worker 在另一個 repo（`crypto-alerts-worker`，branch `feat/research-rule-replace-p12`）。
- 線上訊號用 Supabase **anon** key 呼叫 `dashboard_research_signals()`，即時頁呼叫 `dashboard_research_live()`
  （定義在 `supabase/research_signals.sql`）。資料表 RLS 不開放匿名讀取。
- 回測列表在 `public/data/research_backtest.json`（手冊 6 幣＋樣本外 354 幣，9 月起）。
- `/api/klines` 代理幣安 K 線（`market=futures&interval=5m&from=&to=` 取單筆訊號前後的窗）。

```bash
npm install
npm run dev
```

環境變數（可選，有預設 anon）：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`

部署：Vercel，框架 Next.js。
