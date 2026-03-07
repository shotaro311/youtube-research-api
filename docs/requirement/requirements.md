# youtube-research-api 要件

## 1. 目的

YouTube のソースURLから動画URL一覧を取得し、動画 raw 情報抽出まで行える、リサーチ用途向けの Next.js Web アプリとして提供する。

## 2. v1 の対象

- ブラウザで操作できる単一画面の Web UI を提供する
- チャンネル URL / 再生リスト URL から動画 URL 一覧を取得する
- 1件以上の動画 URL から `rawData` / `metadata` / `diagnostics` を取得する
- Next.js Route Handler で API を提供する
- 既存 `youtube_tr` の `RawVideoData` 互換を維持する

## 3. v1 の非対象

- ローカル保存
- 分析 run 管理
- research 本文生成
- MCP ラッパー

## 4. Web UI 要件

- トップページ `/` に `動画一覧取得` と `動画抽出` の 2 つの操作カードを配置する
- 動画一覧取得結果の動画一覧から、抽出対象URLを画面内で選んで動画抽出欄へ入れられる
- 動画一覧取得結果のURL一覧は、1つのテキストボックス内で改行区切りのURL群として表示し、画面上で直接編集できる見た目にする
- 動画一覧取得カードには、取得したURLを動画抽出側へ送るための補助ボタンを置く
- 動画抽出カードには、通常抽出に加えて「コメントのみ」で抽出できる補助ボタンを置く
- 動画抽出カードの入力欄は改行区切りで複数URLを貼り付けられるテキストボックスにする
- 動画抽出結果は URL ごとのカードを縦に並べて表示し、各URLのタイトル・診断結果・字幕・コメントを個別に閲覧できるようにする
- 複数URLの抽出開始時は、結果カードを先に並べて各カードを抽出中表示にし、完了・失敗ごとに状態が切り替わるようにする
- 動画抽出結果カードは初期状態ではタイトルとURLのみを表示し、開いたときだけ詳細を閲覧できるようにする
- 抽出成功した動画は `AI抽出` シートへ反映できるようにし、反映時は `ドキュメントURL / サムネ / タイトル / 再生数 / 投稿日 / コメント数 / チャンネル名 / 登録者数 / script_id / 台本 / コメント` の順で書き込む
- 動画抽出結果では `rawData` / `metadata` / `diagnostics` の要点を画面上で確認できる
- 動画抽出結果の字幕欄では、取得できた字幕を省略せずスクロール領域内で全件確認できる
- コメントのみ抽出では `includeTranscript: false` / `includeComments: true` で API を呼び、字幕欄には未取得理由を表示する
- 抽出成功した動画の字幕全文とコメント全文は `台本DB` シートへ分離保存し、`/scripts/[scriptId]` で HTML の閲覧画面を開けるようにする
- トップ画面は `docs/sample/youtube-research-console.pen` を読み込み、主要文言・基調色・主要カード高さ・主要ボタン幅を反映する
- Web UI の文言は日本語を基本とし、意味が伝わりにくい技術寄りの表現を避ける
- モダンな見た目で、PC とスマホの両方で崩れずに表示できる

## 5. API 要件

### 5.1 `POST /api/v1/sources/resolve`

- 入力
  - `inputUrl: string`
  - `maxVideos?: number`
- 出力
  - `sourceType: "channel" | "playlist"`
  - `sourceId: string`
  - `sourceName?: string`
  - `urls: string[]`
  - `excluded: { shorts: number; live: number }`

### 5.2 `POST /api/v1/videos/extract`

- 入力
  - `url: string`
  - `includeTranscript?: boolean` 既定値 `true`
  - `includeComments?: boolean` 既定値 `true`
- 出力
  - `rawData`
  - `metadata`
  - `diagnostics`

### 5.3 `GET /api/health`

- 出力
  - `status: "ok"`

## 6. 抽出仕様

- metadata: YouTube Data API `videos`
- channel extra: YouTube Data API `channels`
- comments: YouTube Data API 優先、失敗時のみ Innertube fallback
- transcript: `yt-dlp` -> `youtube-caption-extractor` -> `youtube-transcript-plus` -> Innertube Android -> watch page
- transcript: `yt-dlp` は公式バイナリを同梱し、ローカルと Vercel 本番の両方で実行できるようにする
- transcript: 必要に応じて `YT_DLP_COOKIES_PATH` または `YT_DLP_COOKIES_BASE64` で YouTube cookies を渡せるようにする
- transcript: 途中までの字幕が先に見つかった場合でも後続候補を確認し、より末尾まで取れている字幕を優先する
- transcript: `youtube-transcript-plus` / watch page / Innertube の HTTP リクエストでは browser-like header を付け、必要に応じて別 desktop User-Agent でも再試行する
- transcript: watch page / Innertube で見つかった caption track は XML だけでなく `fmt=json3` でも取得を試みる
- transcript: caption track が `baseUrl` ではなく `signatureCipher` / `cipher` で返る場合も URL を復元して取得を試みる
- transcript / comments の抽出が失敗しても API 全体は失敗させず、空配列で継続する

## 6.1 スプレッドシート連携仕様

- 反映先の既定値は `spreadsheetId = 1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME`、`sheetName = AI抽出`
- 台本全文の保存先既定値は同一スプレッドシート内の `台本DB` シート
- 認証はサービスアカウントJSONを使い、既定ではリポジトリ直下の `gen-lang-client-0823751047-629dc32ab24d.json` を参照する
- デプロイ先でローカルファイルを持てない場合は `GOOGLE_APPLICATION_CREDENTIALS_JSON` にサービスアカウントJSON全文を設定できる
- `GOOGLE_SHEETS_SPREADSHEET_ID` / `GOOGLE_SHEETS_SHEET_NAME` / `GOOGLE_SHEETS_SCRIPT_DB_SHEET_NAME` / `GOOGLE_APPLICATION_CREDENTIALS` / `GOOGLE_APPLICATION_CREDENTIALS_JSON` は、前後の空白や改行が入っていても吸収して使う
- サムネ列はサムネURLではなく `IMAGE()` 関数を書き込んでシート上に画像表示する
- `台本DB` は `script_id / video_id / video_url / title / row_type / chunk_index / content / created_at` を保持し、長文は複数行へ分割保存する
- `台本` は `/scripts/[scriptId]?tab=transcript`、`コメント` は `/scripts/[scriptId]?tab=comments` を指す
- `/scripts/[scriptId]` では DB 保存済み本文を表示し、`/api/v1/scripts/[scriptId]` から JSON をダウンロードできる
- `SCRIPT_VIEWER_BASE_URL` が設定されていれば、その公開URLをリンク生成に使う

## 7. 完了条件

- `npm run verify` が成功する
- `/` で動画一覧取得と動画抽出を操作できる
- `POST /api/v1/sources/resolve` が URL 一覧を返せる
- `POST /api/v1/videos/extract` が `RawVideoData` 互換の `rawData` を返せる
- docs/requirement/requirements.md と docs/plan が現状実装と一致している
