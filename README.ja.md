# AirCursor

**ウェブのための非接触ポインタ。** ウェブカメラごしの手だけで、任意のページを操作します。ホバー、クリック、右クリック、ドラッグ、スクロールを、ふつうのウェブ UI がそのまま理解できる本物のポインタイベントとして発行します。

MediaPipe Hands ベース。ウェブカメラ以外の機材は不要です。処理はすべてブラウザ内で完結し、映像が端末の外に出ることはありません。

**[デモを試す →](https://ritsuki-i.github.io/AirCursor/)** — ウェブカメラがあればブラウザでそのまま動きます。

[English README](./README.md)

```bash
npm install air-cursor
```

```jsx
import AirCursor from 'air-cursor';

export default function App() {
  return <AirCursor />;
}
```

導入はこれだけです。コンポーネントは開始ボタンを描画し、ユーザーがカメラを許可すると、ページの他の部分が手で操作できるようになります。

---

## クリック発火だけのライブラリとの違い

ウェブカメラ系のジェスチャライブラリの多くは、`elementFromPoint` で要素を取り、そこに `click` を1つ投げるだけです。それではボタンとリンクしか動きません。

AirCursor は実際のポインティングデバイスが出すイベント列を合成するので、**順序に依存する挙動**が動きます。

| 操作 | 発行されるイベント |
| --- | --- |
| ホバー | `pointerout` / `pointerleave` → `pointerover` / `pointerenter`（+ `mouse*`） |
| 移動 | `pointermove`, `mousemove` |
| クリック | `pointerdown` → `mousedown` → `pointerup` → `mouseup` → `click` |
| 右クリック | `pointerdown{button:2}` → `pointerup` → `contextmenu` |
| ドラッグ | `pointerdown` → `pointermove`… → `pointerup`（押下時の要素にキャプチャ） |

結果として、`<div onClick>` が反応し、Radix や MUI のメニューが開き（これらは `click` ではなく `pointerdown` を見ています）、ホバーでツールチップが出て、ポインタベースのドラッグライブラリが動き、`event.clientX` を読むハンドラに実際の座標が渡ります。

## ジェスチャ

| ジェスチャ | 動作 |
| --- | --- |
| 人差し指と中指の先を合わせる | ポインタが手に追従します |
| その状態で親指を寄せる | クリック。保持し続けるとドラッグ |
| 親指と人差し指をつまむ（他の指は離す） | ページを掴んで動かし、スクロール |
| 反対の手を握る | 修飾キー。次のクリックが右クリックになります |
| 両手を同時につまむ | 2つのつまみ点を対角とする矩形を囲みます |
| 両手を開いてから、それぞれ1回タップ | 矩形を確定します |
| 選択中に両手をグーで保持 | 矩形を解除します |

閾値はすべて**手のサイズ単位**（手首から中指の付け根までの距離）で測っています。カメラに近くても離れていても、ウィンドウサイズが変わっても、同じジェスチャは同じように認識されます。

ポインタは2つの条件を要求します。人差し指と中指が**他の指と比べて**揃っていること、そして
実際に揃っていること。前者だけだとVサインを受け付けてしまいます。前者は人差し指・中指の
間隔を隣の指の間隔と比べる指標なので、薬指と小指を曲げるとスコアが上がり、2本の指を
どれだけ広げても下がりません。そしてVサインはまさにその2本を曲げます。録画した46件の
Vサインで実測すると、前者だけでは **87% がポインタとして発火** します。両方を課すと
0件になり、きれいなポインタ録画は1フレームも落ちません。

### 画面の端に届かせる

ハンドトラッキングは手全体が画角に入っている必要がありますが、ポインタは指先に乗ります。
カメラ画角全体を画面全体に対応させると、画面の端に届きません。指先が端に達する頃には
手首が画角から出ていて、その時点で手そのものが検出されなくなるからです。これは「範囲が
足りない」ではなく「トラッカーが壊れた」ように見えます。

そこで、画角の一部の矩形を画面全体に対応させます。矩形の外へ押し込んでもポインタは画面端で
止まります（トラックパッドの端で指を滑らせたときと同じ挙動）。手は上下対称ではないので、
インセットも対称ではありません。指は上を向き手首は下に続くので、ポインタの下側の余白は
手1つ分必要ですが、上側は不要です。

```js
{ left: 0.14, right: 0.14, top: 0.06, bottom: 0.24 }   // 画角に対する比率
```

カメラプレビューはこの範囲を**赤枠**で示し、範囲外を暗く落とします。対応関係を推測させず
目で見えるようにするためです。`activeRegion={null}` で従来の全画角対応に戻せます。

### メインスレッドの取り合い

MediaPipeの推論はメインスレッドで動き、しかも軽くありません（60Hzの1フレームの大半を
単独で使います）。Cameraヘルパは毎アニメーションフレームで推論を投げるので、放っておくと
トラッカーが使える限りの時間を取り、ページの描画は残りで動くことになります。既定値は
そこから決めています。

| 設定 | 既定 | 理由 |
| --- | --- | --- |
| `inferenceFps` | 30 | 追跡レートの上限。ポインタは推論の間をフィルタで補間しているので速く追跡しても見た目は変わりませんが、間引いたフレームだけがページの描画に使えます。遅い端末では、推論が実時間の約70%を超えないよう自動的にさらにレートを下げます。30 は閾値を当てはめたときのレートでもあります。 |
| `camera` | 640×480 | ランドマークモデルは数百ピクセルに再サンプルした切り抜きで動くので、720p はフレーム予算のほとんどを何の役にも立たずに消費していました。 |

エンジンは `onStart` に渡され、`engine.inferenceCount` が完了した推論数、`engine.inferenceDurationMs` が1回の推論時間の移動平均（ms）です。自前のフレームカウンタと並べて毎秒サンプル
してください。両者はスレッドを共有してトレードオフの関係にあるので、**分けて見ること**が
カクつきの出どころを言い当てる唯一の方法です。1つの数値に混ぜると、まさにそこが隠れます。

### 両手での範囲選択

**両手**でつまむと、2つのつまみ点を対角とする矩形を囲みます。手を開くとその矩形が
固定され、**両手でそれぞれ1回タップ**すると確定します。何もせず待てば取り消されます。
2本目の手を追跡した時点で、フィルタ済みの両手つまみ判定を待たずスクロールを止めます。
選択中はクリックとスクロールを抑止し、抑止は両手を開くまで続きます。確定・解除に使った
姿勢がそのままページのスクロールに化けるのを防ぐためです。

**両手をグーにして450ms保つ**と、両手から片手のポインター操作へ持ち替えずに解除できます。
コアAPIでは `engine.cancelRegionSelection()` からも解除でき、デモではキーボード用の
代替手段として <kbd>Esc</kbd> も残しています。

2回の確定タップは「同じフレームで両手がつまみ状態になっていること」ではなく、
**それぞれのタップが始まった時刻**が700ms以内に収まっているかで判定します。
「同時に」タップした両手は実際には0.2秒ほどずれ、しかも各つまみは中央値フィルタと
保持時間を通ってから初めて認識されるため、認識済みのつまみ同士は重ならないことが
普通です。1フレームの重なりを要求すると、正しく作られた確定タップのほとんどが
取りこぼされます。

```jsx
<AirCursor onRegionSelect={({ left, top, width, height }) => capture(...)} />
```

```js
document.addEventListener('aircursor:regionselect', (e) => {
  const { left, top, width, height } = e.detail;   // ビューポート座標（px）
});
```

選択中は `onState` に `region` が入るので、矩形の描画と「次に何を待っているか」の
表示ができます:

```js
{
  phase: 'framing' | 'pending' | 'cooldown',
  awaitingConfirm: boolean,   // 両手が開いた。タップを受け付ける状態
  halfConfirmed: boolean,     // 片手はタップ済み。もう片方を待っている
  rejected: 'tooSmall' | 'timeout' | null,   // 破棄された1フレームだけ入る
  rect,
}
```

`rejected` は表示する価値があります。矩形が黙って消えるのは「ジェスチャが認識されな
かった」のと見分けがつかず、実際には認識されて破棄されただけの操作を、ユーザーが
何度もやり直すことになります。

ライブラリは矩形を通知するところまでで、その用途には踏み込みません。ただし画像化に必要な
2つの修正だけは `cropRegion` として同梱しています。どちらも**ジェスチャが成功した後**に
失敗するため、ジェスチャ側の不具合として扱われてしまうからです。

```jsx
import AirCursor, { cropRegion } from 'air-cursor';
import html2canvas from 'html2canvas';   // ライブラリではなく利用側の依存

<AirCursor onRegionSelect={async (rect) => {
  const canvas = await cropRegion(html2canvas, rect);
  document.querySelector('#shot').src = canvas.toDataURL('image/png');
}} />
```

html2canvas は import ではなく引数で渡すので、ライブラリ側に依存は増えません。AirCursor
自身のカーソルとカメラプレビューは既定で切り抜きから除外されます。追加で除外したい要素は
`ignoreElements` を渡してください。

スクリーンショットに
使う場合の注意: 画面キャプチャ系のAPIは実ユーザー操作を必要とし、合成ポインターでは
その条件を満たせません。`getDisplayMedia()` は**開始時のみ**必要なので、実クリックで
一度ストリームを取得しておけば以降は手だけでフレームを切り出せます。`html2canvas` は
許可不要ですが、cross-origin iframe・`<video>`・`preserveDrawingBuffer` なしの
WebGLキャンバスは取得できません。拡張機能の `chrome.tabs.captureVisibleTab()` は
どちらの問題もありません。

html2canvas には実際に時間を取られた罠が2つあります。どちらも**ジェスチャが成功した
後**に失敗するので、ジェスチャ側の不具合に見えます。

```js
html2canvas(document.body, {
  // 矩形はビューポート座標で届き、html2canvas はドキュメント座標を要求するので
  // スクロール量を足す。そのうえで scrollX/scrollY を 0 に固定する。
  // これらは既定で現在のスクロール量になり、x/y に重ねて効くため、足した分が
  // 打ち消される。結果、ビューポートからではなく「ドキュメント最上部から同じ
  // 距離」の場所が切り抜かれ、ページ最上部にいるときだけ正しく見える。
  x: rect.left + window.scrollX,
  y: rect.top + window.scrollY,
  scrollX: 0,
  scrollY: 0,
  width: rect.width,
  height: rect.height,
});
```

0固定の代償として、`position: fixed` 要素はドキュメント最上部からのビューポート
オフセット位置に描かれます。固定オーバーレイは、囲んだ範囲ではなくページ最上部の
切り抜きに写ります。

もう1つは色です。html2canvas 1.4.1 は現代のCSS色関数を知らず、**スキップせずに例外を
投げて**捕獲全体を中断します（`Attempting to parse an unsupported color function`）。
ページのどこかに `color-mix()` が1つあるだけで（Chrome はこれを `color(srgb …)` に
シリアライズします）全ての切り抜きが失敗します。デモでは `onclone` でクローンを走査し、
そうした色を 1×1 canvas 経由で解決して正規化しています（`docs/assets/demo.js`）。

無効にするには `regionSelectEnabled={false}` を指定します。

## オプション

```jsx
<AirCursor
  labels={jaLabels}              // 英語文字列の一部だけ上書きすることも可能
  dominantHand="right"           // 反対の手が修飾キーになります
  modifierEnabled={true}
  regionSelectEnabled={true}    // 両手つまみで範囲選択
  showPreview={true}
  previewPosition="bottom-right"
  skipConsent={false}            // 独自の説明画面を出す場合は true
  autoStart={false}              // 事前にカメラ許可が必要です
  mediapipeBasePath="/mediapipe" // オフライン／キオスク用にモデルを自前配信
  inferenceFps={30}              // 追跡レートの上限。メインスレッドを共有します
  camera={{ width: 640, height: 480 }}
  activeRegion={{ bottom: 0.24 }} // 画面端に届く「カメラ内の有効範囲」
  filter={{ minCutoff: 1.2, beta: 0.012 }}
  scroll={{ gain: 2.2, horizontal: true }}
  thresholds={{ selectEnter: 0.38 }}
  onState={(s) => console.log(s?.mode)}
  onRegionSelect={(r) => console.log(r)}
  onError={(e) => console.error(e)}
/>
```

すべて省略可能です。型定義の全体は [`src/index.d.ts`](./src/index.d.ts) にあります。

### 日本語表示

既定は英語です。日本語の文言はパッケージに同梱しています。

```jsx
import AirCursor, { jaLabels } from 'air-cursor';

<AirCursor labels={jaLabels} />
```

一部だけ差し替えたい場合は、必要なキーだけのオブジェクトを渡してください。

## React を使わない場合

エンジン部分は React に依存していません。

```js
import { AirCursorEngine } from 'air-cursor';

const engine = new AirCursorEngine({
  video: document.querySelector('video'),
  cursorElement: document.querySelector('#cursor'),
  onState: (state) => {
    // { x, y, mode: 'idle' | 'aim' | 'press' | 'grab', modifier } もしくは null
  },
});

await engine.start();
// engine.stop() でカメラを解放します
```

個別の部品も export しています。独自のマッピングを組む場合は `VirtualPointer`、`GrabScroller`、`TwoHandRecognizer`、`OneEuroFilter`、およびランドマーク用のヘルパを利用できます。

## 既知の制限

いずれもブラウザ側の仕様によるもので、このライブラリで解消できるものではありません。

- **user activation は発生しません。** 合成イベントは `isTrusted: false` なので、本物のユーザー操作を要求する API は動きません（クリップボードの読み取り、`requestFullscreen()`、`window.open()` など）。クリップボードへの**書き込み**は、`clipboard-write` がフォーカス中のタブに付与される Chrome では概ね通りますが、Firefox と Safari では通りません。
- **CSS の `:hover` は反応しません。** ホバーのスタイルはブラウザ自身のヒットテストで決まります。JavaScript のホバーハンドラは正しく発火しますが、`:hover` のスタイルは当たりません。AirCursor はカーソル下の要素に `aircursor-hover` クラスを付けるので、併記してください。
  ```css
  .card:hover,
  .card.aircursor-hover { background: #eef; }
  ```
- **HTML5 のネイティブ・ドラッグ&ドロップは開始しません。** `draggable="true"` は信頼されたイベントにしか反応しません。ポインタイベントベースのドラッグライブラリ（dnd-kit、Radix、多くの sortable 系）は問題なく動きます。
- **ダブルクリックは手では実行できません。** クリックは「親指がたまたま通過しただけ」を弾くために一定時間の保持を必要とするため、その2回分がブラウザのダブルクリック受付時間に収まりません。`VirtualPointer` 自体は2回のクリックが十分近ければ `dblclick` を送出します（同じページをマウスで操作すれば発生します）が、手では届きません。ダブルクリックが必要な操作は単クリックに割り当ててください。
- **既定ではモデルを CDN から取得します。** オフライン環境では `mediapipeBasePath` に `@mediapipe/hands` の自前配信先を指定してください。

## 動作要件

- `getUserMedia` と WebAssembly が使えるブラウザ（Chrome、Edge、Firefox、Safari 16 以降）
- セキュアコンテキスト（`https://` または `localhost`）。それ以外ではカメラを使用できません
- コンポーネントを使う場合は React 17 / 18 / 19。エンジンのみなら不要

## 安定して動く理由

推論と実行を意図的に分離しています。MediaPipe は CPU の余力しだいの速度で動き、その速度は変動します。スクロール、カーソル移動、物理演算は `requestAnimationFrame` 側で回しているので、トラッキングが引っかかっても動きは滑らかなままです。

ポインタ位置は [One Euro filter](https://gery.casiez.net/1euro/) を通しています。手が止まっているときは強く平滑化し、速く動いているときはほとんど平滑化しない、という固定のローパスフィルタでは両立できない挙動が得られます。ジェスチャの判定には開始／終了で別の閾値と短い保持時間を設けているため、閾値付近で手が止まってもチャタリングせず、別のポーズへ移動する途中の形が誤って発火することもありません。

## 開発

```bash
npm install
npm run build   # dist/ に CJS と ESM の両方を出力
npm test        # ビルドしてから dist/ に対してテストを実行
```

## 引用について

AirCursor をプロダクトや論文、その他の成果物に利用した場合は、以下での引用に
ご協力いただけると助かります。

```bibtex
@software{ishikawa2026aircursor,
  author  = {Ishikawa, Ritsuki},
  title   = {{AirCursor}: A Touchless Pointer for the Web},
  year    = {2026},
  version = {2.0.0},
  url     = {https://github.com/ritsuki-i/AirCursor}
}
```

## ライセンス

MIT (c) Ritsuki Ishikawa
