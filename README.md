# 盯盤哨兵

幣安現貨＋U 本位永續的監控說明站：策略、回測、即時狀態。

- 即時 worker 在另一個 repo（`crypto-alerts-worker`），這個站不改它。
- 即時頁用 Supabase **anon** key 呼叫 `dashboard_live()`。資料表 RLS 仍關閉匿名讀取。
- 回測 HTML 在 `public/reports/`。摘要在 `public/data/backtests.json`；全市場 491 檔與 902 筆在 `public/data/full_market.json`（回測頁可篩選）。

```bash
npm install
npm run dev
```

環境變數（可選，有預設 anon）：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

部署：Vercel，框架 Next.js。
