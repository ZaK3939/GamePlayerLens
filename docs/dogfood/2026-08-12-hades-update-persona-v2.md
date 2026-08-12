# Hades update strategy / persona v2 dogfood

2026-08-12に、Hades（target）、Hades II、Dead Cells（comparison）を使い、更新履歴取得、persona入力、change evaluation、run封印を実データで再検証した。raw review本文とtool出力はgit管理外の`.game-player-lens-dogfood/`に保持し、この記録には集計と判断境界だけを残す。

## 結果

- `steam_updates`を3作品へ実行し、公式Steam News出力をresultHandleで原本保存した。
- Hadesの最新取得windowでは、44件取得、update-like 20件返却、選択された`patchnotes` tag 15件、title inference 5件だった。返却20件のtype mixはfixes 7、balance 6、content 4、localization 2、major 1。
- Hades IIは20件（tag 8 / title inference 12）、Dead Cellsは20件（tag 9 / title inference 11）を返した。
- `platformHints`でHadesのNintendo Switch明記1件、Dead Cellsのmobile / Mac / Steam Deck明記をSteam build更新と分離できた。
- persona素材は3作品×16件、合計48件。各作品は日本語review 8 positive / 8 negativeで、requested-language fallbackは0件だった。
- target Hadesをpersona入力へ含め、全3 appidの`sourceRoles`を明示し、target / competitor source role、appid、recommendation ID、playtime band、有効な投稿日range、不正日時件数を保持した。
- v2 personaを3件生成し、`save_persona`のschema検証を全件通過した。
- Decision Card、Update inventory、Persona Update Impact Matrix、Prioritized Update Backlog、Data Coverage Matrixを持つchange evaluationを保存した。
- 2 scenarios × 3 domains、3 personas × 2 scenarios、全12 analysis evidenceを14 roundsで使用したrunを封印し、readbackは`integrity.status=verified`、dependency issue 0、構造coverage 100%だった。

## 実データで見つけて直した問題

最初の実行では、Hadesの更新一覧へHades II告知、GOTY告知、Switch告知が本文中の`v1.0 launch`や`demo`だけで混入し、通常patchも本文中の単発語でmajor / eventへ誤分類された。

これを受け、選定と分類を次のように分離した。

- update選定はSteamの`patchnotes` tagまたはboundedなtitle keywordだけに限定する。本文だけでは選定しない。
- `updateEvidence` / `updateConfidence`と、`type` / `typeConfidence`を別にする。
- 本文はupdateと判明した項目のcontent / balance / fixes / localization細分類だけに使う。
- high-impactなmajor判定はtitle根拠を要求する。
- named update title、別platform title hint、requested appidとresponse appidの一致を検査する。
- fetched tag件数とselected tag件数を分ける。

再実行ではHades II告知とGOTY告知がupdate scopeから消え、Post-Launch Patchがfixesへ戻った。SwitchのCross-Saves Updateはtitle上updateであるため残すが、`platformHints=[nintendo-switch]`で境界を保持する。

その後のレビューで、`dispatch` / `updated`の部分一致、複数type語があるtitleの先勝ち、比較元roleの暗黙分類、Date範囲外timestampも追加検証した。title keywordとtype phraseを単語境界で照合し、複数候補では具体的なhotfixを優先する。Hades IIの`v1.0 Hotfix`群はfixesとして再取得できた。`sourceRoles`は全appidの完全対応を要求し、review日時はDate変換可能な値だけをrangeへ採用する。今回の48件で不正日時は0件だった。

## Persona v2

| Persona | 主な判断軸 | Update reaction | Confidence |
|---|---|---|---|
| `jp-story-loop-returner-v2` | 会話・物語差分、終盤反復 | Hades updateへの直接反応なし | medium |
| `jp-action-readability-mastery-v2` | 入力反応、攻撃予兆、読める死因 | 視認性update後の反応なし | medium |
| `jp-value-variety-update-watcher-v2` | 価格、map/build変化、日本語修正 | Dead Cellsの修正反応1件のみobserved | medium |

各personaは`schema_version=2`、`target_context`、adoption / retention / churn / update reaction、voice参照付きobserved patterns、inferred traits、limitationsを持つ。48件は問題発見用のpolarity-balanced sampleであり、市場構成比ではない。

## 保存した意思決定

Decisionは`test-next-build`。対象は`jp-action-readability-mastery-v2`で、最小仮説は既定OFFのVisual Clarity Assistを1 combat room・1 feature flagで試すこととした。床罠の高コントラスト輪郭と画面外ビームedge warningをOFF / ON比較し、攻撃方向識別、画面外攻撃による被弾、死因説明の一致を測る。

これはrelease推奨ではない。操作可能build、人間playtest、telemetryがなく、Gameplay Coverage 25%、全体Coverage 50%、Direct observation 41.7%だったため、confidenceはlowに固定した。競合の更新頻度は実装precedentであって、品質やretention効果の根拠にはしていない。

## 保存記録

- Evaluation: `workspaces/hades/2026-08-12-visual-clarity-update-hypothesis.md`
- Run ID: `52dab8d1-37b4-4218-b09e-75686e9bd49b`
- Run: `workspaces/hades/runs/52dab8d1-37b4-4218-b09e-75686e9bd49b.json`
- Integrity: verified、17 dependencies verified、issue 0
- Structural coverage: scenario/domain 6/6、persona/scenario 6/6、analysis evidence 12/12
- Warnings: 5
- resultHandle保存失敗: 0

このrunは`projectBriefDiagnostics`接続後の`run-sim.md`をrecipeとして再封印し、recipe dependencyを含めてreadback verifiedになった。Hades評価自体は既存ゲームのupdate相談であり、開発中ゲームのbrief入力をdogfoodした証拠には数えない。

次の最小検証は、開発中ゲームの操作可能buildで同じDecision Cardを使い、固定taskのAction → response logを追加すること。今回の検証は更新・persona・結果形式をdogfoodしたものであり、実ゲームtest play完了やoutcome calibrationを意味しない。
