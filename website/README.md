# AirCursor — Gravity, within reach

AirCursor の紹介ページ。Next.js App Router + TypeScript + Tailwind CSS。Hero の光・流線・歪み・星はすべて WebGL で生成し、背景画像や外部フォントを使用しません。

## 起動

このリポジトリのルートから実行します。Node.js 20.9 以上が必要です。

```sh
npm ci
npm run build
cd website
npm ci
npm run dev
```

通常の開発 URL は http://localhost:3000 。今回の確認用サーバーは http://127.0.0.1:3100 です。

```sh
# website/ で実行
npm run typecheck
npm test
npm run test:browser
npm run build
npm start
```

`test:browser` は Google Chrome を使用し、ポート 3100 のサーバーを起動または再利用します。別の Chrome/Chromium を使う場合は `playwright.config.ts` の `channel` を調整してください。

ルートの AirCursor を `file:..` で参照しています。初回はルートのビルドで `dist/` を生成してください。サイトだけ別リポジトリに移す場合は `air-cursor` を npm の公開バージョンに変更し、再インストールします。

## 操作

| 入力 | 使い方 |
| --- | --- |
| マウス | 空間を動かすと流線が追従。空間上で押し続けると吸引・圧縮・解放 |
| タッチ | Hero の空間を押し続ける。縦方向のページスクロールはブラウザに任せる |
| キーボード | Tab で **Play the experience** に移動し Enter / Space |
| 手 | **Enable hand tracking** → カメラを許可 → 右手の人差し指と中指を合わせて移動 → 親指を添えるクリックジェスチャーを保持 |
| 一時停止 | Hero 右下の Pause / Resume |
| カメラ停止 | **Stop camera**。別タブに移る・ページを離れる場合も停止 |

カメラは HTTPS または localhost で動きます。カメラ映像は送信しません。初回のモデル・WASM 読み込みは AirCursor 既定の MediaPipe CDN を使用するため、通信は必要です。カメラ起動をキャンセルした場合は、遅れて完了した起動も停止します。

本物のカメラ映像と使用者の手による認識精度は、この環境では確認していません。実ライブラリのロード、カメラ拒否、入力アダプター、マウス・キーボードの動作は検証対象です。

## 1. コンセプト要約

**Move your hand. Move the Web.** 手のわずかな動きが、Web 全体の振る舞いに変わる。AirCursor を「宇宙の製品」として見せるのではなく、宇宙的な重力場を、触れずに操作できる Web の実例として見せます。

最初は完成された静かな構図。ポインター入力を受けると既存の光の軌道が手元へ従い、広い流れが小さなコアへ凝縮します。凝縮後はその光を保持し、ポインターからクリック状態へ移った瞬間に青白い光を解放します。コピー・導入コード・実際に押せる UI を同じページに置き、この感覚を自分のサイトへ持ち帰れることまで伝えます。

## 2. デザイン方針

| 要素 | 方針 |
| --- | --- |
| 基底色 | `#070c13` / 深い青を含む黒 |
| 本文 | `#edf0ee` / わずかに柔らかい白 |
| 補助文字 | `#94a0ae` / 銀青 |
| 光 | 青からシアン、密度が上がるほど青白く |
| CTA | `#d3f3e2` / 静かなミント色。光景と操作箇所を識別 |
| タイポグラフィ | Helvetica Neue / Arial。大きな見出し、詰めた字間、短いコピー。座標や状態は等幅書体 |
| レイアウト | 左側に読みやすいコピー、右側に画面外まで広がる重力場。下部は細い罫線と余白で構造化 |
| モバイル | コピーの下に光景が現れる縦構図。ナビは開閉式、カードと導入コードは1列 |
| モーション | 滑らかに追従 → 加速しながら収束 → 極小コアを保持 → クリック状態への遷移で一度だけ解放 → 残光 |

Hero の視覚システムは、解析的な楕円座標、ノイズで変形する細い流線、レンズ状の内縁、淡い星雲、疎な星、高密度コア、外向きの波紋で構成します。大量の粒子を追加するのではなく、既存の場の座標・半径・輝度を変化させます。左側の暗いベールでテキストを保護します。

## 3. 情報設計

1. **Hero / Experience** — 価値を一行で伝え、カメラまたは代替入力で体験する。
2. **Beyond the screen** — AirCursor が Web カメラを入力に変える npm ライブラリであることを説明する。
3. **Capabilities** — 自然なジェスチャー、既存 UI とのイベント互換性、端末内での処理。
4. **Possibilities** — クリエイティブサイト、インスタレーション、タッチレス UI。シーン切替と構図を変形するボタンは実際に操作できる。
5. **Make it yours** — npm / pnpm / yarn、コピー機能、最小の React 導入コード。
6. **Closing CTA / Footer** — 導入、GitHub、Docs、MIT ライセンスへつなぐ。

## 4. 実装設計

```text
RootLayout / Home (Server Components)
└─ AirCursorProvider
   ├─ SiteHeader
   ├─ HandTrackingHero
   │  └─ GravityField
   │     ├─ gravity.ts: 状態遷移・物理量
   │     └─ shaders.ts: 光景の生成
   ├─ Capabilities
   ├─ InteractionLab
   └─ InstallSection
```

### 責務と接続

- `AirCursorProvider` / `useAirCursor()` が実際の `AirCursorEngine`、カメラ起動・停止、エラー、映像とカーソル DOM を管理。
- カメラはボタン押下後に dynamic import。通常表示では MediaPipe をロードしません。
- `onState` の viewport 座標を Hero の矩形内の 0〜1 座標へ変換。`hand.mode === "aim"` を集光・圧縮入力へ、`aim` から `press` への遷移を放出入力へ変換。
- ボタンやリンク上でも銀河は手の位置を追い続けます。DOM の hit test と pointer/click event は AirCursor に任せるため、同じ手の操作で通常の UI も利用できます。
- 手・マウス・タッチ・プレビューはすべて `FieldInput` に収束。別の手認識ライブラリに差し替える箇所は Provider です。
- 各フレームの位置や物理値は `ref`。React の状態更新はフェーズやカメラ状態などの UI 表示に限定。

### 状態遷移

| 状態 | 時間 / トリガー | 視覚 |
| --- | --- | --- |
| Ambient | 入力なし | 広い光景、ゆっくりした流れ |
| Detection | 手 / ポインターを検出 | 弱い追従 |
| Attraction | 保持 / プレビュー開始から 0.75秒 | 既存の流線が湾曲し収束 |
| Compression | 1.25秒 | 半径縮小、輝度・密度上昇 |
| Silence | 0.20秒 | 時間と中心座標を固定 |
| Rupture | 0.85秒 | 局所的な青白いフラッシュ、衝撃波、外向きの流線 |
| Afterglow | 2.40秒 | 残光、軌道の再構成、Ambient へ |

初期の吸引中に手を離す、タッチスクロールで操作がキャンセルされる、入力が消失する場合は穏やかに戻ります。圧縮が完了したコアは時間で放出せず、手の位置へ追従しながら待機します。`aim` から `press` へ遷移した瞬間だけ放出し、保持し続けても連続して暴発しません。再操作には一度のリリースが必要です。

### 描画と fallback

- WebGL 1、単一フルスクリーンパス、画像・テクスチャなし。
- DPR 最大 1.5、描画面積約165万ピクセルまで。描画頻度を制限し、手認識は最大24fps。
- 画面外・非表示タブでは描画更新を停止。非表示タブではカメラも停止。
- Pause で不要な描画を停止。`prefers-reduced-motion` では時間アニメーションと衝撃波を抑え、変化のないフレームを描きません。
- WebGL 初期化失敗・context loss では CSS の軌道へ切替。同じ状態機械と説明を維持。
- キーボード操作、focus-visible、aria-live、カメラ状態、エラー、モバイルナビゲーション、コピー失敗時の手動コピー案内。

### MediaPipe と Webpack

この AirCursor の依存する旧 MediaPipe は IIFE の `this` に API を公開します。Next.js / Webpack が named export を取得できるよう、`loaders/mediapipe.cjs` が明示的な CommonJS 境界を追加します。ライブラリ本体や vendor ファイルは改変しません。`dev` と `build` はこのため `--webpack` を明示しています。

構成は [Next.js の Webpack 設定](https://nextjs.org/docs/app/api-reference/config/next-config-js/webpack) と [Tailwind の Next.js 導入ガイド](https://tailwindcss.com/docs/installation/framework-guides/nextjs) に沿っています。カスタム Webpack 設定はフレームワーク更新時に再検証してください。

## 5. コード / ファイル一覧

**[SOURCE.md](./SOURCE.md) に全実装ファイルを、ファイル別のコードブロックで収録しています。** 実際のソースは以下です。

| ファイル | 責務 |
| --- | --- |
| [package.json](./package.json) | 依存関係・起動・検証コマンド |
| [package-lock.json](./package-lock.json) | 検証した依存関係を固定 |
| [tsconfig.json](./tsconfig.json) | TypeScript |
| [next.config.ts](./next.config.ts) | Next.js・MediaPipe互換処理 |
| [postcss.config.mjs](./postcss.config.mjs) | Tailwind CSS |
| [loaders/mediapipe.cjs](./loaders/mediapipe.cjs) | 旧 MediaPipe の export を接続 |
| [src/app/layout.tsx](./src/app/layout.tsx) | メタデータ・ルートレイアウト |
| [src/app/page.tsx](./src/app/page.tsx) | 全セクションの構成 |
| [src/app/globals.css](./src/app/globals.css) | 全デザイン・レスポンシブ・モーション設定 |
| [src/app/icon.svg](./src/app/icon.svg) | favicon |
| [src/components/site-header.tsx](./src/components/site-header.tsx) | ナビゲーション |
| [src/components/icons.tsx](./src/components/icons.tsx) | コードで描くアイコンとブランドマーク |
| [src/components/air-cursor-provider.tsx](./src/components/air-cursor-provider.tsx) | 手認識アダプター |
| [src/components/hand-tracking-hero.tsx](./src/components/hand-tracking-hero.tsx) | Hero UI と代替入力 |
| [src/components/gravity-field.tsx](./src/components/gravity-field.tsx) | 描画ライフサイクル |
| [src/lib/gravity.ts](./src/lib/gravity.ts) | 7段階の状態機械 |
| [src/lib/shaders.ts](./src/lib/shaders.ts) | 手続き的な光・流線・歪み |
| [src/components/interaction-lab.tsx](./src/components/interaction-lab.tsx) | 操作できる利用イメージ |
| [src/components/install-section.tsx](./src/components/install-section.tsx) | 導入コードとコピー |
| [tests/gravity.test.ts](./tests/gravity.test.ts) | 状態遷移の検証 |
| [playwright.config.ts](./playwright.config.ts) | 実ブラウザの検証設定 |
| [tests/browser/site.spec.ts](./tests/browser/site.spec.ts) | UI・エラー・fallback の検証 |
| [scripts/export-source.mjs](./scripts/export-source.mjs) | 全コード一覧の再生成 (`npm run docs:source`) |

`next-env.d.ts` と `.next/` は Next.js が生成します。`AGENTS.md` / `CLAUDE.md` も Next.js の開発サーバーが生成する作業用ファイルです。

### 最終検証結果

- TypeScript 型チェックと Next.js 本番ビルド: 成功。
- 状態機械と粒子場のテスト: 12件成功。圧縮状態の無期限保持とポインター追従、ポインターからクリック状態への遷移による即時解放、連射防止、入力消失時のキャンセル、再操作、時刻ジャンプを確認。
- Chrome のブラウザテスト: 5件成功。デスクトップ操作、モバイル・キーボード・reduced motion、カメラ拒否、WebGL fallback、カメラ開始キャンセル後の遅延応答を確認。
- スクリーンショット: `test-results/hero-ambient.png`、`hero-compression.png`、`hero-rupture.png`、`desktop-ambient.png`、`mobile.png`、`fallback.png`。`npm run test:browser` で再生成。
- 実機の手認識精度、モデルの実ネットワーク配信、端末別 GPU 性能は別途確認が必要。

## 6. 仕上げ / 次に品質を上げる4つの改善

1. **実機ジェスチャー調整** — 明暗、背景、手のサイズ、利き手、カメラ性能を変えて計測し、吸引開始と圧縮の認識を調整する。
2. **端末別品質制御** — 実際の GPU フレーム時間から解像度とノイズの段数を調整し、低消費電力端末でも滑らかさを保つ。
3. **任意の音響** — 明示的なサウンドスイッチを付け、圧縮時の低音、静止時の無音、解放時の短い残響を加える。
4. **モデルの自前配信** — MediaPipe のモデルと WASM を同一オリジンで配信し、展示・キオスク向けの通信条件と初回待機を最適化する。

デプロイや既存の `docs/` の差し替えはこの実装には含めていません。
