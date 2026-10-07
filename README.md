# companion-module-otobako-pro

[Bitfocus Companion](https://bitfocus.io/companion) から **音箱 Pro**（macOS の音響オペレーター卓）を
ネットワーク経由で操作するモジュール。

受け口の仕様は otobako `docs/records/0050-network-control-companion.md`。

## なぜ専用モジュールなのか

汎用 HTTP モジュールでも叩けるが、**フィードバック（再生中はボタンが光る）と
変数（ボタンに曲名を出す）は専用モジュールでしか作れない**。
本番卓としては「いま何が鳴っていて次が何か」が卓上で見えるかどうかが大きい。

## 使い方

### 1. 音箱 Pro 側

ツールバーの **外部制御** →「外部制御を受け付ける」をオン。トークンが自動発行される。

⚠️ **既定はオフ**。会場の LAN は共有されている前提なので、使うときだけ有効にする。

### 2. Companion にこのモジュールを読ませる

正式リリース前は **開発モジュール**として読み込む。

Companion のランチャー窓（起動時に出る小さいウインドウ）の
**「Developer modules path」** に、このディレクトリの**親**を指定して Companion を再起動する:

```
/Users/<user>/Desktop/dev-space/otobako
```

### 3. 接続を追加

**Connections** → **Add connection** → `otobako` で検索 → **otobako Pro**

| 設定     | 値                                                                |
| -------- | ----------------------------------------------------------------- |
| アドレス | 音箱 Pro を動かしている Mac の **名前（例 `MyMac.local`）** か IP |
| ポート   | 8737（既定）                                                      |
| トークン | 音箱 Pro の「外部制御」画面に出ているもの                         |

★ **アドレスには IP より Mac の名前（`.local`）を使うのがおすすめ。**
**IP は DHCP で変わることがある**（会場で朝に繋いだ IP が本番で変わっている、が起きる）が、
名前は変わらない。音箱 Pro の「外部制御」画面に**名前と IP の両方**が出るのでコピーして使う。

⚠️ **名前を使うには Bonjour（mDNS）が要る。** macOS で Companion を動かしているなら標準で解決できる。
**Windows では Bonjour が入っていないと解決できない**ので、その場合は IP を使う。

### 4. プリセットを置く

**Buttons** → 右の **Presets** から `otobako Pro` を選ぶと、
**本番操作**（GO / 停止 / フェードアウトして停止 / すべて停止 / 次 / 前 / 再生中表示）と **パッド 1〜9** が並ぶ。
ボタンへドラッグするだけで使える。

⚠️ **Companion を使うときは Elgato 純正アプリを終了する**（同じ Stream Deck を取り合う）。

## アクション

| アクション             | 送る先            |
| ---------------------- | ----------------- |
| GO（再生して次へ）     | `/go`             |
| 停止                   | `/stop`           |
| フェードアウトして停止 | `/fade-out`       |
| すべて停止（SE 含む）  | `/stop-all`       |
| 次の曲へ / 前の曲へ    | `/next` / `/prev` |
| パッドを鳴らす（1〜9） | `/pad/<n>`        |

⚠️ **パッドは音箱 Pro がパッド表示か分割表示のときだけ鳴る**。リスト表示のときは
音箱 Pro が `409` を返し、モジュールはログに出して**接続は落とさない**（異常ではないため）。

## フィードバック・変数

- フィードバック `再生中`：再生中はボタンの色を変える
- フィードバック `フェードアウト中`：フェードアウト中はボタンの色を変える（もう一度 `/fade-out` を送るとすぐ止まる）。フェードの長さは音箱 Pro の「本番」メニュー
- 変数 `playing`（再生中の曲）/ `standby`（次に GO で鳴る曲）/ `se_count`（鳴っている SE 数）

状態は `/status` を 500ms ごとに取得している。

## 開発・テスト・パッケージ

Bitfocus の公式テンプレート（companion-module-template-js）と同じ構成＝**Yarn 4**（`package-lock.json` は CI で弾かれる）。
グローバルの yarn が 1.x なら **`corepack yarn …`** で動かす（`corepack enable` はしなくてよい）。

```bash
corepack yarn install
corepack yarn test      # node --test
corepack yarn format    # prettier。差分が出ない状態で出す（CI が見る）
corepack yarn package   # mds-otobako-pro-<version>.tgz を作る
```

テストは manifest の妥当性・entrypoint の実在・**既定ポートとパッド本数が音箱 Pro 側と一致していること**・
プリセット参照の整合を見る（ずれると「押しても鳴らない」「プリセットが出ない」になり、原因が分かりにくい）。

- `companion/manifest.json` の `version` と `runtime.apiVersion` は **`0.0.0` のまま**にする（`yarn package` が
  `package.json` の版と `@companion-module/base` の版で埋める）。
- `.tgz` は Companion の **Modules** 画面から読み込める（公式ストアに載る前の配布手段）。

## 公式ストアへの登録（未実施）

1. Bitfocus のコミュニティ（`#module-development`）に GitHub ユーザー名とモジュール名 `mds-otobako-pro` を伝える
   → Bitfocus が `bitfocus/companion-module-mds-otobako-pro` を用意する。
2. このディレクトリの中身をそのリポジトリへ push（`.github/workflows` の CI が走る）。
3. `package.json` の版を上げ、`v1.0.0` のようにタグを push。
4. [developer.bitfocus.io](https://developer.bitfocus.io/) に GitHub でログイン → My Connections → **Submit Version** でタグを選ぶ。
   ボランティアの審査後、Companion 4.0 以降のモジュールストアに並ぶ。
