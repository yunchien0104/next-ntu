# Next@NTU

Next@NTU 是一個給台大學生使用的大學生涯 AI Coach 互動原型。

## 技術架構

- Next.js App Router
- TypeScript
- Tailwind CSS
- Static Export（輸出至 `out/`，可部署到純靜態主機）

## 本機開發

```bash
pnpm install
pnpm dev
```

開啟 <http://localhost:3000>。

## 檢查與建置

```bash
pnpm typecheck
pnpm build
```

## 主要目錄

```text
app/                    Next.js 頁面、版面與全域樣式
components/auth/        登入畫面
components/coach/       AI Coach、歷史紀錄與生涯待辦
components/calendar/    日曆與協作任務
components/columns/     校園專欄
components/talent/      人才庫
components/resume/      履歷編輯器與即時預覽
components/layout/      頂部導覽、設定與個人檔案
components/ui/          共用按鈕、對話框與提示元件
lib/                    型別、初始資料與瀏覽器儲存工具
public/                 靜態圖片
```

此版本仍是純前端互動原型。登入、AI 回覆與資料來源是示範流程，尚未連接正式身分驗證、資料庫或 AI API。
