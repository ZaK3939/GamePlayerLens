# 辛口批評家 rubric

目的は文章を厳しく見せることではなく、意思決定に耐えるまで弱い根拠と自己都合の解釈を落とすことです。合格は、選択された領域に対するすべてのゲートを満たした場合だけです。

## 1. スコープと Mode ゲート

- レポート冒頭に Mode、Selected Domains、領域ごとの選択理由または明示的な N/A 理由がなければ差し戻す。
- `baseline` は現状だけを評価する。変更案を仮定したり、現状 vs 変更案の表を出したりしない。
- `change` は同じ評価軸と根拠で現状 vs 変更案を比較する。変更案だけの単独評価は差し戻す。
- Selected Domains の選択外にある領域は N/A とし、根拠未取得や未評価を不合格理由にしない。

## 2. 根拠ゲート

- 根拠なし主張が1つでもあれば差し戻し。
- 事実主張には tool 取得値、保存済み artifact、または追跡可能な persona voice を付ける。
- Evidence Index の各項目に `artifact repository-relative path`、`observedAt`、`source` がなければ差し戻す。
- tool返り値に `meta.resultHandle` があるのに、それを使わずpayloadをモデルが再serialize、統合、抜粋、要約した場合は差し戻す。保存artifactはwarningとmetaを含むtool出力原本と一致させる。
- 推論は事実と分け、「この根拠からの推論」と明記する。
- データが欠けた箇所を平均値や一般論で埋めない。「根拠不足」とし、必要な取得条件を指定する。
- `observed`（source が観測時点の実値を返した通常値）、`reported-zero`（source が 0 を明示）、`missing`（未取得または欠損）、`estimated`（推定）を区別する。observed から履歴や将来値を推測せず、missing を 0 で補完せず、estimated には方法と caveat を付ける。
- SteamSpy `owners` は所有数の推定範囲であり、売上本数ではない。売上、販売速度、成長を断定する根拠に使わない。
- SteamSpy `average_forever=0` は、原値を reported-zero として残した上で、欠損相当とした解釈と warning を記録する。CCU=0 は有効な観測時点の値として保持する。

## 3. ゲームプレイ・ストア訴求・ローカライズ品質ゲート

- タグ（tags）やcategoriesだけからゲームロジック、内部状態遷移、バランス実装を断定した場合は差し戻す。description、tags、categories、reviewsはプレイヤー知覚のproxyであり、内部ロジックの評価には仕様、build、動画、telemetry、playtestの直接根拠を要求する。
- ストア訴求を選択した場合は、`localizedStorefronts`のcopy、screenshotsまたはcapture、競合の同種根拠、レビュー上の期待差を分けて示す。deep linkを貼っただけでリンク先の内容を取得済み根拠にしない。
- 対応言語一覧だけから翻訳品質、文化適合、フォント可読性を断定した場合は差し戻す。requested localeのstore copy、対象言語レビュー、またはゲーム内captureの少なくとも1つを要求し、Steam fallbackの可能性を明記する。`matchesEnglishCopy=true` は正規化後の完全一致だけを示し、fallbackの理由や翻訳品質の証明として扱わない。`matchesEnglishCopy=false` も非一致だけを示し、fallbackでない、意図した言語が返った、翻訳済みと断定しない。

## 4. UI 品質ゲート

- UI 品質ゲートは、Selected Domains で `ui` が選択された場合だけ適用する。UI が選択外なら明示的な理由とともに N/A とし、画像やブラインド比較がないことを不合格理由にしない。
- `ui` が選択された場合は、対象 UI と、指定された `qualityTier` と同等の出荷済み製品の UI を匿名化したブラインド比較にかける。qualityTier が未指定なら、比較基準を仮定せず確認する。
- 評価者は正解開示前に、階層、可読性、密度、状態表現、入力フィードバック、一貫性の判定を固定する。
- 単なる装飾追加を修正とせず、負けた評価軸とスクリーンショット上の位置を修正指示にする。
- UI が選択されているのに比較画像を取得できない場合は合格にせず、手動配置先を示して「根拠不足」とする。

## 5. Persona voice ゲート

- persona の発言が `voice[].text` と矛盾する場合は差し戻し。
- 発言の根拠に `source_appid` または `recommendation_id` が欠落していれば差し戻し。language と voted_up も照合する。
- polarity-balanced persona sample は `representative: false` である。positive/negative の構成を `population ratio` や市場母集団の好評率として使った場合は差し戻す。
- 1件の強いレビューを市場全体の意見として一般化しない。反対極性と別 Flow の根拠も確認する。

## 6. Flow Size ゲート

- Flow Size を大 / 中 / 小または数値で示す場合は、母集団の `reviewStats`、SteamSpy `owners` の推定 caveat、市場規模や需要に関する外部根拠を確認する。いずれかが欠けるなら数量断定を差し戻す。
- balanced sample の件数比、個別 persona の強さ、現在 CCU のいずれか単独から Flow Size を推定しない。

## 7. 領域整合ゲート

- Selected Domains の各担当が、同じ対象仕様と、change の場合は同じ変更案を評価していること。
- ある領域の改善が別領域の Friction を増やす場合、Overall Assessment に反映すること。
- 現在 CCU は取得時点のスナップショットとして扱い、過去トレンドや因果を捏造しないこと。
- Final Recommendation に、勧告、根拠と結びついた `confidence`、および実行可能な `next validation` がなければ差し戻す。

## 8. 反復と停止条件

選択された全領域の subagent が上記ゲートに合格するまで、修正、再評価、辛口批評を繰り返します。ただし同一指摘が、同じ欠損データのため2回続けて解消できない場合は、無限に書き換えません。「根拠不足として停止」と記録し、必要な外部データ、担当者判断、または実験を具体化して終了します。

合格記録には、適用対象となった各ゲートの pass、参照した根拠、未解消だが停止条件に該当した項目を残してください。
