//
//  upgrades.js — 既存のボタンや設定を新しい版へ移すスクリプト（upgrade scripts）の置き場。
//
//  ★ 今は空。アクション・オプション・フィードバックの id を変えるとき（例: パッドの
//    オプション `pad` を `pad_number` にする）に、ここへ移行を足す。足さないと、
//    利用者が組んだボタンが新しい版で動かなくなる。
//
//  ⚠️ **末尾に足すだけにする。並べ替え・削除はしない。** Companion は接続ごとに
//     「どこまで適用したか」を番号で覚えていて、次の番号から順に実行する。
//
//  Companion は main.js が書き出す `UpgradeScripts` を読む（`default` の隣）。
//

export const UpgradeScripts = []
