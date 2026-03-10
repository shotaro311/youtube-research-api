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
- 動画一覧取得カードでは、主要ボタンと抽出側へ送る補助ボタンを入力URL欄の上に配置する
- 動画抽出カードでは、通常抽出ボタンと「コメントのみ」補助ボタンを入力URL欄の上に配置する
- 動画抽出カードの入力欄は改行区切りで複数URLを貼り付けられるテキストボックスにする
- 動画抽出結果は URL ごとのカードを縦に並べて表示し、各URLのタイトル・診断結果・字幕・コメントを個別に閲覧できるようにする
- 複数URLの抽出開始時は、結果カードを先に並べて各カードを抽出中表示にし、完了・失敗ごとに状態が切り替わるようにする
- 動画抽出結果カードは初期状態ではタイトルとURLのみを表示し、開いたときだけ詳細を閲覧できるようにする
- 抽出成功した動画は `動画分析` シートへ反映できるようにし、反映時は `ドキュメントURL / サムネ / タイトル / 再生数 / 投稿日 / コメント数 / チャンネル名 / 登録者数 / script_id / 台本 / コメント` の順で書き込む
- 動画抽出結果では `rawData` / `metadata` / `diagnostics` の要点を画面上で確認できる
- 動画抽出結果の字幕欄では、取得できた字幕を省略せずスクロール領域内で全件確認できる
- コメントのみ抽出では `includeTranscript: false` / `includeComments: true` で API を呼び、字幕欄には未取得理由を表示する
- 抽出成功した動画の字幕全文とコメント全文は `台本DB` シートへ分離保存し、`/scripts/[scriptId]` で HTML の閲覧画面を開けるようにする
- 抽出成功した動画の各コメントは、分析しやすいよう `コメントDB` シートへ `1コメント = 1行` で追加保存する
- 抽出成功した動画の各コメントは、人が見やすい一覧として `コメント分析` にも `1コメント = 1行` で追加保存する
- `動画分析` シートのサムネ列はデフォルトの `IMAGE()` ではなく、約4倍サイズのカスタム表示で書き込む
- `/scripts/[scriptId]` の閲覧画面では大きめのサムネを表示し、クリックで元画像を開けるようにする
- `/scripts/[scriptId]?tab=comments` では、コメントを投稿者名と本文に分けたカード表示で見やすく確認できるようにする
- `/scripts/[scriptId]?tab=transcript` では `台本分析` ボタンを押すと、元の台本を保存し直さずに、元の台本の右側へ `動画の流れ / 視聴者心理の変化 / 視聴者に寄り添う発言 / 企画意図 / 良い部分 / 改善が必要な部分 / 総合評価` を分析表示できるようにする
- `/scripts/[scriptId]?tab=comments` では `コメント分析` ボタンをコメントコピーの右に置き、分析後は上部に折りたたみ可能な総評ブロック、下部にコメント本文と各コメントごとの分析結果を縦並びで表示できるようにする
- コメント分析結果では、コメント本文がひと目で分かるように通常の分析文より強めに表示する
- コメント分析結果は、総評・コメント本文・個別フィードバックをまとめて一括コピーでき、JSON ファイルとしても保存できるようにする
- `/scripts/[scriptId]` の台本 / コメント切り替えは、初回表示時に読み込んだデータを client 側で切り替えて、待機時間を減らす
- コメント分析後は、保存順を新着順として扱い、`ポジティブ / 中立 / ネガティブ` のタグで絞り込み表示できるようにする
- コメント分析の比率カードとタグ切り替えは、アイコン付きのクリック導線でコメント一覧まで移動できるようにする
- コメント分析の `ポジティブ / 中立 / ネガティブ` 比率は、AI が返した要約値ではなく、実際の分析済みコメント件数から再計算した値を表示する
- コメント分析では、個別コメントの感情タグを編集した時点で、比率カードとフィルター件数もその場で再計算して連動表示する
- コメント分析の個別編集では、保存はカード上部の操作ボタンから行えるようにし、感情タグだけは編集モードに入らなくても直接変更できるようにする
- コメント分析の総評、視聴者像、視聴者心理、ポジティブ傾向、ネガティブ傾向、および各コメントの感情タグ / 視聴者像 / 心理 / 個別フィードバックは、編集ボタンから編集して保存できるようにする
- コメント分析総評の操作列には削除ボタンも置き、保存済み分析結果を `台本DB` から削除できるようにする
- コメント分析の保存は、総評を `台本DB` シートへ `comment_analysis` 行として保存しつつ、各コメントの感情タグ・視聴者像・心理・個別フィードバックは `コメントDB` と `コメント分析` の対応行にも同期する
- 同じ `scriptId` を開いた際は、保存済みの分析結果を初期表示に使う
- `動画分析` へ新しく反映する時点で、同一 `video_id + author + comment_text` の分析済みデータが `コメントDB` にあれば、その分析列を `コメントDB` と `コメント分析` の新規行へ引き継ぐ
- `台本分析` と `コメント分析` の表示結果は、同じ `scriptId` を再読込した際にブラウザ内で復元できるようにする
- `/scripts/[scriptId]` の台本タブとコメントタブには、それぞれ全文を一括コピーできるボタンを置く
- `/scripts/[scriptId]` をスプレッドシートリンクから開くときは、白画面の代わりにダークテーマのローディング表示を出す
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

### 5.4 `POST /api/v1/scripts/[scriptId]/analyze`

- 入力
  - なし
- 出力
  - `title: string`
  - `flowStages: { stage: string; summary: string; viewerPsychology: string }[]`
  - `empathyMoments: string[]`
  - `creatorIntent: string`
  - `viewerStrengths: string[]`
  - `viewerImprovements: string[]`
  - `overallScore: number`
  - `overallVerdict: string`
  - `overallEvaluation: string`

### 5.5 `POST /api/v1/scripts/[scriptId]/comments/analyze`

- 入力
  - なし
- 出力
  - `title: string`
  - `overview: string`
  - `positivePercent: number`
  - `neutralPercent: number`
  - `negativePercent: number`
  - `audienceSummary: string`
  - `psychologySummary: string`
  - `positiveThemes: string[]`
  - `negativeThemes: string[]`
  - `items: { commentIndex: number; sentiment: "positive" | "neutral" | "negative"; viewerType: string; psychology: string; note: string }[]`

### 5.6 `PUT /api/v1/scripts/[scriptId]/comments/analyze`

- 入力
  - `title: string`
  - `overview: string`
  - `audienceSummary: string`
  - `psychologySummary: string`
  - `positiveThemes: string[]`
  - `negativeThemes: string[]`
  - `items: { commentIndex: number; sentiment: "positive" | "neutral" | "negative"; viewerType: string; psychology: string; note: string }[]`
- 出力
  - 保存後に正規化されたコメント分析結果

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

- 反映先の既定値は `spreadsheetId = 1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME`、`sheetName = 動画分析`
- 台本全文の保存先既定値は同一スプレッドシート内の `台本DB` シート
- コメント単位データの保存先既定値は同一スプレッドシート内の `コメントDB` シート
- コメント一覧の保存先既定値は同一スプレッドシート内の `コメント分析` シート
- 認証はサービスアカウントJSONを使い、既定ではリポジトリ直下の `gen-lang-client-0823751047-629dc32ab24d.json` を参照する
- デプロイ先でローカルファイルを持てない場合は `GOOGLE_APPLICATION_CREDENTIALS_JSON` にサービスアカウントJSON全文を設定できる
- `GOOGLE_SHEETS_SPREADSHEET_ID` / `GOOGLE_SHEETS_SHEET_NAME` / `GOOGLE_SHEETS_SCRIPT_DB_SHEET_NAME` / `GOOGLE_SHEETS_COMMENT_DB_SHEET_NAME` / `GOOGLE_SHEETS_COMMENT_SHEET_NAME` / `GOOGLE_APPLICATION_CREDENTIALS` / `GOOGLE_APPLICATION_CREDENTIALS_JSON` は、前後の空白や改行が入っていても吸収して使い、旧名 `AI抽出` / `コメントシート` が設定されていても新名へ読み替える
- サムネ列はサムネURLではなく `IMAGE(url,4,height,width)` のカスタムサイズ式を書き込み、追加行の行高とサムネ列幅も合わせて調整する
- `台本DB` は `script_id / video_id / video_url / title / row_type / chunk_index / content / created_at` を保持し、長文は複数行へ分割保存する
- `コメントDB` は `comment_id / script_id / video_id / video_url / title / channel_name / published_at / comment_index / author / comment_text / likes / created_at / sentiment / viewer_type / psychology / note / analysis_updated_at` を保持し、コメント分析用の正規化データとして使う
- `コメント分析` は `コメントID / 動画タイトル / 動画リンク / チャンネル名 / 投稿者 / コメント本文 / 感情タグ / 視聴者像 / 心理 / 個別フィードバック / 分析更新日時` を保持し、人が読みやすい一覧として使う
- `台本DB` の `row_type` には `meta / transcript / comments / comment_analysis` を使い、コメント分析の保存結果も同じ `script_id` に紐づける
- `台本` は `/scripts/[scriptId]?tab=transcript`、`コメント` は `/scripts/[scriptId]?tab=comments` を指す
- `/scripts/[scriptId]` では DB 保存済み本文を表示し、`/api/v1/scripts/[scriptId]` から JSON をダウンロードできる
- `SCRIPT_VIEWER_BASE_URL` が設定されていれば、その公開URLをリンク生成に使う
- `台本分析` は `GEMINI_API_KEY` が設定されているときだけ利用できる
- `台本分析` の既定モデルは `gemini-3.1-flash-lite-preview` とする
- `コメント分析` は `GEMINI_API_KEY` が設定されているときだけ利用できる
- `コメント分析` の既定モデルは `gemini-3.1-flash-lite-preview` とする

## 7. 完了条件

- `npm run verify` が成功する
- `/` で動画一覧取得と動画抽出を操作できる
- `POST /api/v1/sources/resolve` が URL 一覧を返せる
- `POST /api/v1/videos/extract` が `RawVideoData` 互換の `rawData` を返せる
- docs/requirement/requirements.md と docs/plan が現状実装と一致している
