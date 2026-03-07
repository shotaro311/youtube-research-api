# youtube-research-api

YouTube の URL 解決と動画 raw 情報抽出を、ブラウザから使える Next.js 製の Web アプリです。画面操作と API の両方を同じリポジトリで提供します。

## 主な機能

- `/`
  - ソース URL 解決と動画抽出を 1 画面で操作
- `POST /api/v1/sources/resolve`
  - 入力: `inputUrl`, `maxVideos?`
  - 出力: `sourceType`, `sourceId`, `sourceName?`, `urls[]`, `excluded`
- `POST /api/v1/videos/extract`
  - 入力: `url`, `includeTranscript?`, `includeComments?`
  - 出力: `rawData`, `metadata`, `diagnostics`
- `GET /api/health`
  - 出力: `status`

## Setup

```bash
npm install
cp .env.example .env
```

`.env`

```bash
YOUTUBE_API_KEY=your_api_key
```

## Scripts

```bash
npm run dev
npm run build
npm run verify
```

## Notes

- 必須環境変数は `YOUTUBE_API_KEY` です
- `/` の主要文言・基調色・主要カード高さ・主要ボタン幅は `docs/sample/youtube-research-console.pen` をサーバー側で読み込んで反映します
- 動画抽出カードでは、通常抽出に加えて `コメントのみ` ボタンから字幕なしのコメント抽出も行えます
- 動画抽出カードでは、複数URLを改行区切りで貼り付けて一括抽出し、URLごとの結果カードを縦に並べて確認できます
- 抽出結果カードは初期状態ではタイトルとURLだけを表示し、開くと詳細を確認できます
- 抽出成功した動画は `AI抽出` シートへ反映できます。認証は `GOOGLE_APPLICATION_CREDENTIALS` またはリポジトリ直下のサービスアカウントJSONを使います
- Vercel などファイル配置できない環境では `GOOGLE_APPLICATION_CREDENTIALS_JSON` にサービスアカウントJSON全文を設定すると、Sheets 連携をそのまま使えます
- シート反映時は要約行を `AI抽出` に追記しつつ、字幕全文とコメント全文を `台本DB` に保存します。`AI抽出` の `台本` / `コメント` 列から `/scripts/[scriptId]` の閲覧ページを開け、同ページから JSON もダウンロードできます
- 共有できる URL をシートへ書き込みたい場合は `SCRIPT_VIEWER_BASE_URL` に公開URLを設定してください。未設定時はリクエスト元 origin を使います
- `.pen` を更新したら、開発中は画面を再読込、本番反映は再ビルドで同期されます
- 詳細仕様は `docs/requirement/requirements.md` を参照してください
