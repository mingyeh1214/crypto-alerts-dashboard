import type { Metadata } from "next";
import { LockedBoard } from "../signals/LockedBoard";

export const metadata: Metadata = { title: "合約訊號 · 盯盤哨兵" };

export default function PerpSignalsPage() {
  return (
    <main>
      <h1>僅永續合約</h1>
      <p className="lead">
        只列沒有同名現貨的 U 本位永續（listing_type = perp_only）。K 線、成交額 z、轉強與 ATR 都用合約 1 分 K，不看現貨量。
        其餘跟鎖定規則一樣：z ≥ 2.78、轉強 ≥ +1% 且這一分鐘不收跌、前 24 小時 ≤ +12%、嚴格 OI（1 小時增倉且 OI-z ≥ 1.2）、
        合格首次過線、15 分 ATR 0.8%～2.5%、進場前最後一筆資金費率不低於 −0.10%、同幣冷卻 24 小時。
        回測窗是台北時間 2026 年 9 月整月。8 月合約 1 分 K 只拿來暖機 30 日量能 z，不進清單。
        當下位置、當下建議與一小時手冊跟現貨頁同一套算法，只描述訊號當時，不預測後面，也不自動開空。新的僅永續進場會送 Telegram，標成「合約 · 僅永續」；現貨交集照舊另送。這頁仍是九月回測。
      </p>
      <LockedBoard
        dataUrl="/data/locked_perp_signals.json"
        liveFeed={false}
        chartMarket="futures"
        unitLabel="檔永續"
      />
    </main>
  );
}
