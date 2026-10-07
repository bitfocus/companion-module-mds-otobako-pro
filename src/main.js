//
//  companion-module-otobako-pro / main.js
//
//  Bitfocus Companion から音箱 Pro（macOS）を操作するモジュール。
//  受け口の仕様は otobako `docs/records/0050-network-control-companion.md`。
//
//  ⚠️ なぜ専用モジュールを作るのか（ユーザー要望・2026-09-21「ATEM みたいなプロファイル」）:
//     汎用 HTTP モジュールでも叩けるが、**フィードバック（再生中はボタンが光る）と
//     変数（ボタンに曲名を出す）は専用モジュールでしか作れない**。
//     本番卓としては「いま何が鳴っていて次が何か」が卓上で見えるかどうかが大きい。
//
//  ⚠️ **音箱 Pro 側は既定で外部制御オフ**。アプリの「外部制御」画面で有効にして
//     トークンを発行してもらう必要がある（会場の LAN は共有前提のため）。
//

import { InstanceBase, InstanceStatus, Regex, combineRgb } from '@companion-module/base'

/** パッド番号の本数。音箱 Pro 側の performancePadCount と揃える。 */
const PAD_COUNT = 9

/** 状態取得の間隔（ms）。ボタンの点灯が遅れて見えない程度に短く、負荷にならない程度に長く。 */
const POLL_INTERVAL = 500

/** 1リクエストの上限（ms）。⚠️ 切らないと無応答の相手でポーリングが詰まる。 */
const REQUEST_TIMEOUT = 2000

const COLOR_WHITE = combineRgb(255, 255, 255)
const COLOR_BLACK = combineRgb(0, 0, 0)
const COLOR_DARK = combineRgb(20, 20, 20)
const COLOR_GREEN = combineRgb(0, 160, 60)
const COLOR_RED = combineRgb(180, 0, 0)
const COLOR_ORANGE = combineRgb(220, 120, 0)

export default class OtobakoProInstance extends InstanceBase {
	async init(config) {
		this.config = config
		this.lastStatus = null
		this.updateStatus(InstanceStatus.Connecting)
		this.buildDefinitions()
		this.startPolling()
	}

	async destroy() {
		this.stopPolling()
	}

	async configUpdated(config) {
		this.config = config
		this.startPolling()
	}

	getConfigFields() {
		return [
			// 英日併記（公式ストアの利用者は海外が中心・国内の現場向けに日本語も残す）。
			{
				type: 'static-text',
				id: 'intro',
				width: 12,
				label: 'Connection / 接続について',
				value:
					'In otobako Pro, open "External Control" in the toolbar, turn it on, and paste the token shown there. ' +
					'⚠️ While it is on, devices on the same network can control playback.<br><br>' +
					'音箱 Pro のツールバー「外部制御」で受け付けを有効にし、表示されるトークンをここに貼り付けてください。' +
					'⚠️ 有効にすると同じネットワーク上の機器から再生を操作できます。',
			},
			{
				type: 'textinput',
				id: 'host',
				// ★ ホスト名（`.local`）も入れられる。**IP は DHCP で変わるが名前は変わらない**ので、
				//   会場で「朝に繋いだ IP が本番で変わっている」を避けられる。
				//   ⚠️ ただし Windows の Companion は Bonjour が入っていないと `.local` を解決できない。
				label: 'Address / アドレス',
				tooltip:
					'An IP address (e.g. 192.168.1.20) or the Mac name (e.g. MyMac.local). ' +
					'The name is recommended because it does not change with DHCP (both are shown in "External Control"). ' +
					'Companion on Windows needs Bonjour to resolve names; otherwise use the IP. / ' +
					'IP アドレス（例 192.168.1.20）か、Mac の名前（例 MyMac.local）を入れてください。' +
					'名前は IP と違って DHCP で変わらないのでおすすめです（音箱 Pro の「外部制御」画面に両方表示されます）。' +
					'Windows の Companion では Bonjour が無いと名前を解決できないので、その場合は IP を使ってください。',
				width: 6,
				default: '127.0.0.1',
				regex: Regex.HOSTNAME,
			},
			{
				type: 'number',
				id: 'port',
				label: 'Port / ポート',
				width: 3,
				default: 8737,
				min: 1,
				max: 65535,
			},
			{
				type: 'textinput',
				id: 'token',
				label: 'Token / トークン',
				tooltip: 'Shown in "External Control" in otobako Pro. / 音箱 Pro の「外部制御」画面に表示されます。',
				width: 12,
				default: '',
			},
		]
	}

	// MARK: 定義

	buildDefinitions() {
		const padChoices = []
		for (let n = 1; n <= PAD_COUNT; n++) padChoices.push({ id: n, label: `Pad ${n} / パッド ${n}` })

		this.setActionDefinitions({
			go: {
				name: 'GO (play and advance) / GO（再生して次へ）',
				options: [],
				callback: async () => this.send('/go'),
			},
			stop: {
				name: 'Stop / 停止',
				options: [],
				callback: async () => this.send('/stop'),
			},
			// フェードの長さは音箱 Pro 側の設定（「本番」メニュー）。フェード中にもう一度送るとすぐ止まる（#0062）。
			fade_out: {
				name: 'Fade out and stop / フェードアウトして停止',
				options: [],
				callback: async () => this.send('/fade-out'),
			},
			stop_all: {
				name: 'Stop all (incl. SE) / すべて停止（SE 含む）',
				options: [],
				callback: async () => this.send('/stop-all'),
			},
			next: {
				name: 'Next cue (no playback) / 次の曲へ（鳴らさない）',
				options: [],
				callback: async () => this.send('/next'),
			},
			prev: {
				name: 'Previous cue (no playback) / 前の曲へ（鳴らさない）',
				options: [],
				callback: async () => this.send('/prev'),
			},
			pad: {
				name: 'Play pad / パッドを鳴らす',
				options: [{ type: 'dropdown', id: 'pad', label: 'Pad / パッド番号', default: 1, choices: padChoices }],
				callback: async (action) => this.send(`/pad/${Number(action.options.pad) || 1}`),
			},
		})

		this.setFeedbackDefinitions({
			is_playing: {
				type: 'boolean',
				name: 'Playing / 再生中',
				description:
					'Change the button style while otobako Pro is playing / 音箱 Pro が再生中のときボタンの見た目を変えます',
				defaultStyle: { bgcolor: COLOR_GREEN, color: COLOR_WHITE },
				options: [],
				callback: () => this.lastStatus?.isPlaying === true,
			},
			is_fading_out: {
				type: 'boolean',
				name: 'Fading out / フェードアウト中',
				description:
					'Change the button style while otobako Pro is fading out / 音箱 Pro がフェードアウト中のときボタンの見た目を変えます',
				defaultStyle: { bgcolor: COLOR_ORANGE, color: COLOR_BLACK },
				options: [],
				callback: () => this.lastStatus?.isFadingOut === true,
			},
		})

		this.setVariableDefinitions({
			playing: { name: 'Now playing / 再生中の曲' },
			standby: { name: 'Standby (plays on next GO) / 次に GO で鳴る曲（スタンバイ）' },
			se_count: { name: 'Number of SEs playing / 鳴っている SE の数' },
		})

		this.buildPresets()
	}

	buildPresets() {
		const presets = {}

		presets.go = {
			type: 'simple',
			name: 'GO (play and advance) / GO（再生して次へ）',
			style: { text: 'GO\n$(otobako:standby)', size: '14', color: COLOR_WHITE, bgcolor: COLOR_DARK },
			steps: [{ down: [{ actionId: 'go', options: {} }], up: [] }],
			// 再生中は緑になる＝卓を見れば出ているかが分かる（汎用 HTTP ではできない部分）。
			feedbacks: [{ feedbackId: 'is_playing', options: {}, style: { bgcolor: COLOR_GREEN, color: COLOR_BLACK } }],
		}
		presets.stop = {
			type: 'simple',
			name: 'Stop / 停止',
			style: { text: 'STOP', size: '18', color: COLOR_WHITE, bgcolor: COLOR_RED },
			steps: [{ down: [{ actionId: 'stop', options: {} }], up: [] }],
			feedbacks: [],
		}
		presets.fade_out = {
			type: 'simple',
			name: 'Fade out and stop / フェードアウトして停止',
			style: { text: 'FADE\nOUT', size: '14', color: COLOR_WHITE, bgcolor: COLOR_DARK },
			steps: [{ down: [{ actionId: 'fade_out', options: {} }], up: [] }],
			// フェード中は橙になる＝もう一度押すとすぐ止まる、が卓で分かる。
			feedbacks: [{ feedbackId: 'is_fading_out', options: {}, style: { bgcolor: COLOR_ORANGE, color: COLOR_BLACK } }],
		}
		presets.stop_all = {
			type: 'simple',
			name: 'Stop all (incl. SE) / すべて停止（SE 含む）',
			style: { text: 'ALL\nSTOP', size: '14', color: COLOR_WHITE, bgcolor: COLOR_RED },
			steps: [{ down: [{ actionId: 'stop_all', options: {} }], up: [] }],
			feedbacks: [],
		}
		presets.next = {
			type: 'simple',
			name: 'Next cue / 次の曲へ',
			style: { text: '▼\nNEXT', size: '14', color: COLOR_WHITE, bgcolor: COLOR_DARK },
			steps: [{ down: [{ actionId: 'next', options: {} }], up: [] }],
			feedbacks: [],
		}
		presets.prev = {
			type: 'simple',
			name: 'Previous cue / 前の曲へ',
			style: { text: '▲\nPREV', size: '14', color: COLOR_WHITE, bgcolor: COLOR_DARK },
			steps: [{ down: [{ actionId: 'prev', options: {} }], up: [] }],
			feedbacks: [],
		}
		presets.now_playing = {
			type: 'simple',
			name: 'Now playing (press to stop) / 再生中の表示（押すと停止）',
			style: { text: '$(otobako:playing)', size: '14', color: COLOR_WHITE, bgcolor: COLOR_DARK },
			steps: [{ down: [{ actionId: 'stop', options: {} }], up: [] }],
			feedbacks: [{ feedbackId: 'is_playing', options: {}, style: { bgcolor: COLOR_GREEN, color: COLOR_BLACK } }],
		}

		const padRefs = []
		for (let n = 1; n <= PAD_COUNT; n++) {
			const id = `pad_${n}`
			presets[id] = {
				type: 'simple',
				name: `Pad ${n} / パッド ${n}`,
				style: { text: `PAD\n${n}`, size: '14', color: COLOR_WHITE, bgcolor: COLOR_DARK },
				steps: [{ down: [{ actionId: 'pad', options: { pad: n } }], up: [] }],
				feedbacks: [],
			}
			padRefs.push(id)
		}

		this.setPresetDefinitions(
			[
				{
					id: 'transport',
					name: 'Transport / 本番操作',
					description:
						'Advance and stop the show. GO means "play and advance". / 進行を送る・止める。GO は「再生して次へ」です。',
					// ⚠️ **参照はただの文字列（プリセット id）**。オブジェクトで書くと
					//    Companion が "invalid definitions" として**黙って全部無視する**
					//    （モジュール自体は正常に読み込まれるので気づきにくい・実機で踏んだ）。
					definitions: ['go', 'stop', 'fade_out', 'stop_all', 'next', 'prev', 'now_playing'],
				},
				{
					id: 'pads',
					name: 'Pads / パッド',
					description:
						'Trigger the sounds on the pad view. ⚠️ Pads do not play while otobako Pro is in list view. / パッド面に出ている音を叩きます。⚠️ 音箱 Pro がリスト表示のときは鳴りません。',
					definitions: padRefs,
				},
			],
			presets,
		)
	}

	// MARK: 通信

	buildURL(path) {
		const host = (this.config?.host || '').trim()
		const port = Number(this.config?.port) || 8737
		const token = this.config?.token || ''
		if (!host || !token) return null
		return `http://${host}:${port}${path}?token=${encodeURIComponent(token)}`
	}

	/**
	 * 操作を送る。
	 * ⚠️ 409（not available）は**異常ではない**（例: リスト表示でパッドを叩いた）。
	 *    接続を落とさず、理由だけログに出す。
	 */
	async send(path) {
		const url = this.buildURL(path)
		if (!url) {
			this.updateStatus(InstanceStatus.BadConfig, 'Set the address and token / IP とトークンを設定してください')
			return
		}
		try {
			const response = await this.fetchWithTimeout(url)
			if (response.status === 401) {
				this.updateStatus(InstanceStatus.AuthenticationFailure, 'Invalid token / トークンが違います')
				return
			}
			if (response.status === 409) {
				this.log(
					'info',
					`${path} is not available right now; check the view in otobako Pro / ${path} はいま実行できません（音箱 Pro 側の表示状態を確認してください）`,
				)
				return
			}
			if (!response.ok) {
				this.log('warn', `${path} failed (HTTP ${response.status}) / ${path} が失敗しました（HTTP ${response.status}）`)
				return
			}
			this.updateStatus(InstanceStatus.Ok)
		} catch (error) {
			this.updateStatus(InstanceStatus.ConnectionFailure, String(error?.message ?? error))
		}
	}

	async fetchWithTimeout(url) {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
		try {
			return await fetch(url, { signal: controller.signal })
		} finally {
			clearTimeout(timer)
		}
	}

	// MARK: 状態の取得

	startPolling() {
		this.stopPolling()
		this.pollTimer = setInterval(() => {
			this.poll().catch(() => {})
		}, POLL_INTERVAL)
		this.poll().catch(() => {})
	}

	stopPolling() {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = undefined
		}
	}

	async poll() {
		const url = this.buildURL('/status')
		if (!url) {
			this.updateStatus(InstanceStatus.BadConfig, 'Set the address and token / IP とトークンを設定してください')
			return
		}
		try {
			const response = await this.fetchWithTimeout(url)
			if (response.status === 401) {
				this.updateStatus(InstanceStatus.AuthenticationFailure, 'Invalid token / トークンが違います')
				return
			}
			if (!response.ok) {
				this.updateStatus(InstanceStatus.ConnectionFailure, `HTTP ${response.status}`)
				return
			}
			const status = await response.json()
			this.applyStatus(status)
			this.updateStatus(InstanceStatus.Ok)
		} catch (error) {
			this.updateStatus(InstanceStatus.ConnectionFailure, String(error?.message ?? error))
			this.applyStatus(null)
		}
	}

	applyStatus(status) {
		const changed =
			this.lastStatus?.isPlaying !== status?.isPlaying || this.lastStatus?.isFadingOut !== status?.isFadingOut
		this.lastStatus = status
		this.setVariableValues({
			playing: status?.playing ?? '',
			standby: status?.standby ?? '',
			se_count: status?.seCount ?? 0,
		})
		// 変わったときだけ再評価する（500ms ごとに全フィードバックを回さない）。
		if (changed) this.checkFeedbacks('is_playing', 'is_fading_out')
	}
}
