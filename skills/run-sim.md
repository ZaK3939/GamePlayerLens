# run-sim

対象ゲームまたは変更案について、Steam の実データと追跡可能なペルソナを使い、採用可能性評価を作成してください。外部取得の warning を隠さず、データがない結論は「根拠不足」にしてください。

## 入力

- 対象名と、仕様テキスト・企画書・ローカルURL・コードzipのいずれか
- 相談テーマ。変更相談なら現状と変更案の両方
- 既知の競合、対象市場、対象言語。未指定なら候補を探索

## 実行手順

1. `get_knowledge` で templates の `adoption-eval.md`、rubrics の `harsh-critic.md`、既存 personas を読みます。過去の `workspaces/` 評価があれば相談履歴として読みます。
2. 対象がURLなら `ui_capture` で主要状態を取得します。失敗時は warning に従って `knowledge/ui-references/` へ手動配置を依頼し、画像未取得のUI断言を止めます。
3. `steam_search` で競合候補を広く探し、`steam_fetch` のタグ、言語、地域価格、レビュー統計から類似3〜5本を選びます。選定理由も根拠として保存します。
4. 各競合に `steam_timeline` を使い、現在CCUスナップショット、owners、平均プレイ時間、取得可能なら価格履歴を集めます。現在値から過去トレンドを推測しません。
5. 必要な言語・極性・プレイ時間条件を `steam_reviews` で確認します。続いて競合 appid 群を `derive_personas` に渡します。返された schema とレビュー出典から指定件数の異なる persona JSON を生成し、その後に各 JSON を `save_persona` で保存します。`derive_personas` → `save_persona` の順序を逆にしてはいけません。
6. UI×persona、価格、ローカライズ、競合の領域別 subagent に、同一の対象仕様・変更案・intel・persona を渡して評価します。各主張に取得値または voice の recommendation ID を付けます。
7. `ui-blind-compare` の手順で対象UIと本物UIを比較し、正解開示前の判定を固定します。続いて harsh-critic rubric で全領域を審査し、差し戻しを修正します。同一の根拠欠損が反復したら rubric の停止条件に従います。
8. `knowledge/templates/adoption-eval.md` を埋め、`workspaces/<target>/<date>-<topic>.md` に保存します。変更相談は全セクションを「現状 vs 変更案」で記述します。

## 完了条件

- 事実主張が tool 出力、`knowledge/intel/`、または persona voice へ追跡できる。
- 8 tool の役割を混同せず、外部 warning と根拠不足をレポートに残した。
- ペルソナ発言に `source_appid` と `recommendation_id` がある。
- Flow Summary と Overall Assessment が領域別所見と矛盾しない。
- 出力先と、次に検証すべき未解決事項を報告した。
