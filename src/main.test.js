//
//  main.test.js — モジュールの「壊れていたら気づけない」部分だけを固定する。
//  `node --test` で走る（Companion 本体は要らない）。
//
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import validate from '../node_modules/@companion-module/base/generated/validate_manifest.js'
import Instance, * as entry from './main.js'

const manifest = JSON.parse(fs.readFileSync(new URL('../companion/manifest.json', import.meta.url), 'utf8'))

test('manifest が Companion の検証を通る', () => {
	// ⚠️ ここが崩れると Companion がモジュールを一切読み込まず、原因が分かりにくい。
	assert.ok(validate(manifest), JSON.stringify(validate.errors))
})

test('entrypoint が実在する', () => {
	const entry = new URL(`../companion/${manifest.runtime.entrypoint}`, import.meta.url)
	assert.ok(fs.existsSync(entry), `${manifest.runtime.entrypoint} が見つからない`)
})

test('既定ポートが音箱 Pro 側と一致している', () => {
	// 音箱 Pro: ControlProtocol.defaultPort = 8737
	const fields = Instance.prototype.getConfigFields.call({})
	const port = fields.find((f) => f.id === 'port')
	assert.equal(port.default, 8737)
})

test('URL の組み立て＝トークンは必ず付き、未設定なら作らない', () => {
	const build = Instance.prototype.buildURL
	assert.equal(
		build.call({ config: { host: '10.0.0.2', port: 8737 }, secrets: { token: 'abc' } }, '/go'),
		'http://10.0.0.2:8737/go?token=abc',
	)
	// ⚠️ 未設定のまま叩きに行かない（無意味な接続失敗でログを埋めない）。
	assert.equal(build.call({ config: { host: '' }, secrets: { token: 'abc' } }, '/go'), null)
	assert.equal(build.call({ config: { host: '10.0.0.2' }, secrets: { token: '' } }, '/go'), null)
})

test('ホスト名（.local）でも接続先を組み立てられる', () => {
	// ★ IP は DHCP で変わるので、会場では `.local` 名を使ってもらう（音箱 Pro が画面に出す）。
	//   ⚠️ 検証の regex（Regex.HOSTNAME）が IP しか通さなくなると、この入力ができなくなる。
	const build = Instance.prototype.buildURL
	assert.equal(
		build.call({ config: { host: 'MyMac.local', port: 8737 }, secrets: { token: 'abc' } }, '/go'),
		'http://MyMac.local:8737/go?token=abc',
	)

	const host = Instance.prototype.getConfigFields.call({}).find((f) => f.id === 'host')
	const src = host.regex
	const last = src.lastIndexOf('/')
	const re = new RegExp(src.slice(1, last), src.slice(last + 1))
	assert.ok(re.test('MyMac.local'), 'ホスト名が検証を通らない')
	assert.ok(re.test('192.168.1.20'), 'IP が検証を通らない')
})

test('トークンは URL エスケープされる', () => {
	const url = Instance.prototype.buildURL.call({ config: { host: 'h', port: 1 }, secrets: { token: 'a b&c' } }, '/go')
	assert.ok(url.endsWith('token=a%20b%26c'), url)
})

test('トークンの前後の空白は無視される', () => {
	// ⚠️ ダイアログからのコピーでは末尾に空白が付きやすい。見た目は正しいのに認証失敗になる。
	const url = Instance.prototype.buildURL.call({ config: { host: 'h', port: 1 }, secrets: { token: ' abc ' } }, '/go')
	assert.ok(url.endsWith('token=abc'), url)
	// 改行も同じ（複数行の選択からのコピー）。
	const url2 = Instance.prototype.buildURL.call({ config: { host: 'h', port: 1 }, secrets: { token: 'abc\n' } }, '/go')
	assert.ok(url2.endsWith('token=abc'), url2)
})

test('空白だけのトークンは未設定として扱う', () => {
	// 叩きに行っても必ず 401 になる。未設定（BadConfig）として案内した方が直し方が分かる。
	assert.equal(
		Instance.prototype.buildURL.call({ config: { host: 'h', port: 1 }, secrets: { token: '   ' } }, '/go'),
		null,
	)
})

test('トークンは secrets からだけ読む（config.token は使わない）', () => {
	// ⚠️ v1.1.1 で secret-text に移した。config 側に古い値が残っていても、それで叩きに行かない
	//    （設定の書き出しに載る側の値を使い続けることになる）。
	assert.equal(Instance.prototype.buildURL.call({ config: { host: 'h', port: 1, token: 'abc' } }, '/go'), null)
	assert.equal(
		Instance.prototype.buildURL.call({ config: { host: 'h', port: 1, token: 'abc' }, secrets: {} }, '/go'),
		null,
	)
})

test('トークンは secret-text で持つ', () => {
	// ⚠️ textinput に戻すと設定の書き出しにトークンが平文で載る。
	const field = Instance.prototype.getConfigFields.call({}).find((f) => f.id === 'token')
	assert.equal(field.type, 'secret-text')
})

test('接続失敗の理由が設定のどこを直すか分かる形になる', () => {
	const describe = (error) => Instance.prototype.describeError.call({ config: { host: 'h', port: 1 } }, error)
	const refused = new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } })
	assert.equal(describe(refused), 'ECONNREFUSED')
	assert.match(describe(new DOMException('timed out', 'TimeoutError')), /h:1/)
	assert.equal(describe(new Error('boom')), 'boom')
})

test('中止された操作は接続失敗にしない', async () => {
	const statuses = []
	const controller = new AbortController()
	controller.abort()
	const stub = {
		config: { host: 'h', port: 1 },
		secrets: { token: 'abc' },
		buildURL: Instance.prototype.buildURL,
		fetchWithTimeout: Instance.prototype.fetchWithTimeout,
		updateStatus: (...args) => statuses.push(args),
	}
	await Instance.prototype.send.call(stub, '/go', controller.signal)
	assert.deepEqual(statuses, [])
})

test('変数は変わったものだけ送る', () => {
	// 500ms ごとのポーリングで同じ値を送り続けない。
	const sent = []
	const stub = {
		lastStatus: null,
		setVariableValues: (values) => sent.push(values),
		checkFeedbacks() {},
	}
	const apply = (status) => Instance.prototype.applyStatus.call(stub, status)
	apply({ playing: 'A', standby: 'B', seCount: 0 })
	apply({ playing: 'A', standby: 'B', seCount: 0 })
	apply({ playing: 'A', standby: 'C', seCount: 0 })
	assert.deepEqual(sent, [{ playing: 'A', standby: 'B', se_count: 0 }, { standby: 'C' }])
})

test('状態が読めない応答（401・エラー）では点灯と変数を消す', async () => {
	// ⚠️ 通信の失敗のときだけ消していた（v1.1.1 の審査の L1）。トークン違いやエラー応答のあいだ、
	//    最後に読めた「再生中」でボタンが光り続け、卓の表示が実際と食い違う。
	for (const status of [401, 500, 404]) {
		const statuses = []
		const sent = []
		const checked = []
		const stub = {
			config: { host: 'h', port: 1 },
			secrets: { token: 'abc' },
			buildURL: Instance.prototype.buildURL,
			fetchWithTimeout: async () => ({ ok: false, status, body: null }),
			updateStatus: (...args) => statuses.push(args[0]),
			applyStatus: Instance.prototype.applyStatus,
			setVariableValues: (values) => sent.push(values),
			checkFeedbacks: (...ids) => checked.push(...ids),
			lastStatus: { isPlaying: true, isFadingOut: false, playing: 'A', standby: 'B', seCount: 1 },
			lastVariables: { playing: 'A', standby: 'B', se_count: 1 },
		}
		await Instance.prototype.poll.call(stub)
		assert.equal(statuses.length, 1, `HTTP ${status}`)
		assert.equal(stub.lastStatus, null, `HTTP ${status}: 状態が残っている`)
		assert.deepEqual(sent, [{ playing: '', standby: '', se_count: 0 }], `HTTP ${status}: 変数が消えていない`)
		assert.ok(checked.includes('is_playing'), `HTTP ${status}: フィードバックを再評価していない`)
	}
})

test('UpgradeScripts を入口から書き出している', () => {
	// ★ Companion は入口の `default` と `UpgradeScripts` を読む（無ければ空として扱う）。
	//   今は空。id を変えるときに src/upgrades.js の末尾へ足す。
	assert.ok(Array.isArray(entry.UpgradeScripts))
	assert.equal(entry.default, Instance)
})

test('パッドは9本で音箱 Pro 側と揃っている', () => {
	// 音箱 Pro: performancePadCount = 9
	const src = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8')
	assert.match(src, /const PAD_COUNT = 9/)
})

test('プリセットの参照が全て実体に解決する', () => {
	// ⚠️ **実機で踏んだ**: 参照をオブジェクト（{type:'preset',id}）で書いたところ、
	//    Companion は "invalid definitions" として**黙って全部無視**した。
	//    モジュール自体は正常に読み込まれるので、卓にプリセットが出ないことでしか気づけない。
	//    参照は `CompanionPresetReference = string`＝**ただのプリセット id**。
	let structure, presets
	const stub = {
		setActionDefinitions() {},
		setFeedbackDefinitions() {},
		setVariableDefinitions() {},
		setPresetDefinitions(s, p) {
			structure = s
			presets = p
		},
	}
	stub.buildPresets = Instance.prototype.buildPresets.bind(stub)
	Instance.prototype.buildDefinitions.call(stub)

	const referenced = new Set()
	for (const section of structure) {
		for (const entry of section.definitions) {
			assert.equal(typeof entry, 'string', `参照は文字列であるべき: ${JSON.stringify(entry)}`)
			assert.ok(presets[entry], `未定義のプリセットを参照している: ${entry}`)
			referenced.add(entry)
		}
	}
	// 逆向きも見る＝定義したのにどのセクションからも参照されていないと Companion は無視する。
	for (const id of Object.keys(presets)) {
		assert.ok(referenced.has(id), `どのセクションからも参照されていない: ${id}`)
	}
})

test('プリセットの steps と feedbacks が既定の形になっている', () => {
	let presets
	const stub = {
		setActionDefinitions() {},
		setFeedbackDefinitions() {},
		setVariableDefinitions() {},
		setPresetDefinitions(_s, p) {
			presets = p
		},
	}
	stub.buildPresets = Instance.prototype.buildPresets.bind(stub)
	Instance.prototype.buildDefinitions.call(stub)

	for (const [id, preset] of Object.entries(presets)) {
		assert.equal(preset.type, 'simple', id)
		assert.ok(Array.isArray(preset.steps) && preset.steps.length > 0, id)
		assert.ok(Array.isArray(preset.steps[0].down), id)
		assert.ok(Array.isArray(preset.steps[0].up), id)
		assert.ok(Array.isArray(preset.feedbacks), id)
	}
})

test('表示名は英日併記になっている', () => {
	// ★ 公式ストアの利用者は海外が中心。日本語だけの名前を足すと海外の現場で読めない。
	//   形は「English / 日本語」（英語を先に＝幅の狭い一覧でも頭で意味が分かる）。
	let actions, feedbacks, variables, structure, presets
	const stub = {
		setActionDefinitions(a) {
			actions = a
		},
		setFeedbackDefinitions(f) {
			feedbacks = f
		},
		setVariableDefinitions(v) {
			variables = v
		},
		setPresetDefinitions(s, p) {
			structure = s
			presets = p
		},
	}
	stub.buildPresets = Instance.prototype.buildPresets.bind(stub)
	Instance.prototype.buildDefinitions.call(stub)

	const names = [
		...Object.values(actions).map((a) => a.name),
		...Object.values(actions).flatMap((a) => a.options.map((o) => o.label)),
		...Object.values(feedbacks).map((f) => f.name),
		...Object.values(variables).map((v) => v.name),
		...structure.map((s) => s.name),
		...Object.values(presets).map((p) => p.name),
		...Instance.prototype.getConfigFields.call({}).map((f) => f.label),
	]
	for (const name of names) {
		assert.match(name, /^[\x20-\x7E]+ \/ .*[^\x00-\x7F]/, `英日併記になっていない: ${name}`)
	}
})
