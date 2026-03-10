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
GEMINI_API_KEY=your_gemini_api_key
```

## Scripts

```bash
npm run dev
npm run build
npm run verify
```

## Notes

- 必須環境変数は `YOUTUBE_API_KEY` です
- 台本ビューアの `台本分析` を使う場合は `GEMINI_API_KEY` も設定してください
- 台本ビューアの `台本分析` は `gemini-3.1-flash-lite-preview` を使います
- コメントタブの `コメント分析` も `gemini-3.1-flash-lite-preview` を使います
- `/` の主要文言・基調色・主要カード高さ・主要ボタン幅は `docs/sample/youtube-research-console.pen` をサーバー側で読み込んで反映します
- `/` の左右カードでは、主要操作ボタンを各入力URL欄の上に配置しています
- 動画抽出カードでは、通常抽出に加えて `コメントのみ` ボタンから字幕なしのコメント抽出も行えます
- 動画抽出カードでは、複数URLを改行区切りで貼り付けて一括抽出し、URLごとの結果カードを縦に並べて確認できます
- 抽出結果カードは初期状態ではタイトルとURLだけを表示し、開くと詳細を確認できます
- 抽出成功した動画は `動画分析` シートへ反映できます。認証は `GOOGLE_APPLICATION_CREDENTIALS` またはリポジトリ直下のサービスアカウントJSONを使います
- Vercel などファイル配置できない環境では `GOOGLE_APPLICATION_CREDENTIALS_JSON` にサービスアカウントJSON全文を設定すると、Sheets 連携をそのまま使えます
- `npm install` 時に公式 `yt-dlp` バイナリを `vendor/yt-dlp/yt-dlp` へ取得し、Vercel 本番でも字幕 fallback として使います
- Vercel では字幕抽出 API を `hnd1` 優先で動かし、日本リージョン寄りで YouTube 抽出の安定化を図ります
- YouTube の bot check に当たる場合は、任意で `YT_DLP_COOKIES_PATH` または `YT_DLP_COOKIES_BASE64` を設定すると `yt-dlp` に cookies を渡せます
- シート反映時は要約行を `動画分析` に追記しつつ、字幕全文とコメント全文を `台本DB` に保存します。`動画分析` の `台本` / `コメント` 列から `/scripts/[scriptId]` の閲覧ページを開け、同ページから JSON もダウンロードできます
- シート反映時は分析用に `コメントDB`、閲覧用に `コメント分析` も使い、各コメントを `1コメント = 1行` で保存します。どちらも無い場合は初回反映時に自動作成します
- `/scripts/[scriptId]` の台本タブでは `台本分析` ボタンから、元の台本の右側に `動画の流れ / 視聴者心理の変化 / 寄り添い発言 / 企画意図 / 良い部分 / 改善が必要な部分 / 総合評価` を表示できます
- `/scripts/[scriptId]` のコメントタブでは `コメント分析` ボタンから、上部に折りたたみ可能な総評、下部にコメント本文と個別フィードバックをまとめた一覧を表示できます
- コメント分析結果は `分析一式をコピー` と `JSON保存` で一括持ち出しできます
- コメント分析では、感情タグを編集すると比率カードとフィルター件数もその場で再計算されます
- コメント分析の総評や視聴者分析は `台本DB` の `comment_analysis` 行として保存し、各コメントの感情タグ・視聴者像・心理・個別フィードバックは `コメントDB` と `コメント分析` の各行にも同期して保存します
- 同じ動画・同じコメント本文の分析済みデータが `コメントDB` にあれば、新しく `動画分析` へ反映した時点で `コメント分析` にも分析列を引き継ぎます
- コメント分析の比率カードとタグフィルターはアイコン付きでクリックでき、対象コメント一覧へ切り替えながら移動できます
- コメント分析総評には削除ボタンもあり、保存済み分析結果を DB から消せます
- コメント分析の保存はカード上部の操作列から行え、感情タグだけは編集モードに入らず直接変更できます
- 台本 / コメントのタブ切り替えは client 側で切り替えるため、同一ページ内でよりスムーズに行えます
- コメント分析後は `新着順` を基準に、`ポジティブ / 中立 / ネガティブ` のタグで絞り込みできます
- コメント分析の比率は AI の要約値ではなく、実際の分析件数から再計算して表示します
- `台本分析` と `コメント分析` の表示結果は、同じ `scriptId` を開き直したときにブラウザ内へ復元します
- スプレッドシートから `/scripts/[scriptId]` を開くときは、ダークテーマのローディングUIを表示します
- 共有できる URL をシートへ書き込みたい場合は `SCRIPT_VIEWER_BASE_URL` に公開URLを設定してください。未設定時はリクエスト元 origin を使います
- `.pen` を更新したら、開発中は画面を再読込、本番反映は再ビルドで同期されます
- 詳細仕様は `docs/requirement/requirements.md` を参照してください
