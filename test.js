//
//  test.js — モジュールの「壊れていたら気づけない」部分だけを固定する。
//  `node --test` で走る（Companion 本体は要らない）。
//
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import validate from './node_modules/@companion-module/base/generated/validate_manifest.js'
import Instance from './src/main.js'

const manifest = JSON.parse(fs.readFileSync(new URL('./companion/manifest.json', import.meta.url), 'utf8'))

test('manifest が Companion の検証を通る', () => {
	// ⚠️ ここが崩れると Companion がモジュールを一切読み込まず、原因が分かりにくい。
	assert.ok(validate(manifest), JSON.stringify(validate.errors))
})

test('entrypoint が実在する', () => {
	const entry = new URL(`./companion/${manifest.runtime.entrypoint}`, import.meta.url)
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
		build.call({ config: { host: '10.0.0.2', port: 8737, token: 'abc' } }, '/go'),
		'http://10.0.0.2:8737/go?token=abc',
	)
	// ⚠️ 未設定のまま叩きに行かない（無意味な接続失敗でログを埋めない）。
	assert.equal(build.call({ config: { host: '', token: 'abc' } }, '/go'), null)
	assert.equal(build.call({ config: { host: '10.0.0.2', token: '' } }, '/go'), null)
})

test('ホスト名（.local）でも接続先を組み立てられる', () => {
	// ★ IP は DHCP で変わるので、会場では `.local` 名を使ってもらう（音箱 Pro が画面に出す）。
	//   ⚠️ 検証の regex（Regex.HOSTNAME）が IP しか通さなくなると、この入力ができなくなる。
	const build = Instance.prototype.buildURL
	assert.equal(
		build.call({ config: { host: 'MyMac.local', port: 8737, token: 'abc' } }, '/go'),
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
	const url = Instance.prototype.buildURL.call({ config: { host: 'h', port: 1, token: 'a b&c' } }, '/go')
	assert.ok(url.endsWith('token=a%20b%26c'), url)
})

test('パッドは9本で音箱 Pro 側と揃っている', () => {
	// 音箱 Pro: performancePadCount = 9
	const src = fs.readFileSync(new URL('./src/main.js', import.meta.url), 'utf8')
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
