## otobako Pro (音箱 Pro)

Control **otobako Pro**, a cue-playback console for macOS, from Companion over the network.
Buttons can fire GO, stop playback and trigger pads, and show what is playing and what is next.

日本語の説明は下にあります。

### Requirements

- otobako Pro 1.1.0 or later (Mac App Store).
- **External Control is a paid feature of otobako Pro.** Unlock it in the app before using this module.
- Companion and the Mac must be on the same network.

### Setup

1. In otobako Pro, click **外部制御 (External Control)** in the toolbar and turn on **外部制御を受け付ける (Accept external control)**.
   A token is generated automatically. External Control is **off by default** and no port is opened until you turn it on.
2. In Companion, add a connection for **otobako Pro** and fill in:

| Field   | Value                                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------- |
| Address | The Mac's name (e.g. `MyMac.local`) or its IP address. Both are shown in otobako Pro's External Control sheet. |
| Port    | `8737` (default)                                                                                               |
| Token   | The token shown in otobako Pro's External Control sheet                                                        |

Using the Mac's `.local` name is recommended because IP addresses assigned by DHCP can change.
On Windows, `.local` names need Bonjour; use the IP address if the name does not resolve.

3. Open **Buttons → Presets → otobako Pro** and drag the presets (**Transport** and **Pads**) onto your buttons.

Names in Companion are shown in English and Japanese (e.g. `Stop / 停止`).

If you use a Stream Deck with Companion, quit the Elgato Stream Deck app first (both apps try to use the same device).

### Actions

| Action                  | Description                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| GO (play and advance)   | Play the standby cue and move to the next one                                                                    |
| Stop                    | Stop the current cue                                                                                             |
| Fade out and stop       | Fade the current cue out, then stop (length is set in otobako Pro's "Live" menu; send again to stop immediately) |
| Stop all (incl. SE)     | Stop everything, including sound effects                                                                         |
| Next cue / Previous cue | Move the selection without playing                                                                               |
| Play pad                | Trigger pad 1–9                                                                                                  |

Pads only play while otobako Pro shows the pad or split view. In list view the app answers `409`; the module logs it and keeps the connection up.

### Feedbacks and variables

- Feedback **Playing**: changes the button style while otobako Pro is playing.
- Feedback **Fading out**: changes the button style while otobako Pro is fading out.
- Variables: `$(otobako:playing)` (playing cue), `$(otobako:standby)` (cue that GO will play next), `$(otobako:se_count)` (number of sound effects playing).

The module polls otobako Pro's status every 500 ms.

### Troubleshooting

- **Authentication failure**: the token does not match. Copy it again from otobako Pro (it changes when you reissue it).
- **Connection failure**: check that External Control is turned on, the address and port are correct, and both machines are on the same network.

---

## 音箱 Pro（日本語）

macOS の音響オペレーター卓「音箱 Pro」を、Companion からネットワーク経由で操作します。

- **外部制御は音箱 Pro の有料機能です。** アプリ内で解錠してからお使いください。
- 音箱 Pro のツールバー「外部制御」→「外部制御を受け付ける」をオンにします（既定はオフ・トークンは自動発行）。
- Companion で **otobako Pro** の接続を追加し、アドレス（Mac の名前 `○○.local` または IP）・ポート `8737`・トークンを入れます。
- **Buttons → Presets → otobako Pro** から「Transport / 本番操作」と「Pads / パッド」をボタンへドラッグすれば卓が組めます。
- Stream Deck を使う場合は、Elgato 純正アプリを終了してください（同じ機器を取り合います）。
- パッドは音箱 Pro がパッド表示か分割表示のときだけ鳴ります。
