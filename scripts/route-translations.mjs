// SPDX-License-Identifier: GPL-3.0-or-later
// Addon-owned UI strings; native language packs and their credits remain intact.
const rows=[
 ['协同四路线AI设置','Coordinated four-route AI settings','協同四路線AI設定','連携4ルートAI設定','협동 4경로 AI 설정'],
 ['添加队友类型','Teammate AI type','新增隊友類型','追加するAIの種類','추가할 AI 유형'],
 ['协同四路线AI（推荐）','Coordinated four-route AI (recommended)','協同四路線AI（推薦）','連携4ルートAI（推奨）','협동 4경로 AI (권장)'],
 ['原有AI','Original AI','原有AI','既存AI','기존 AI'],
 ['四AI终极模拟测试（房主观战）','Four-AI Abyss test (host spectates)','四AI終極模擬測試（房主觀戰）','AI4人の終極模擬テスト（ホストは観戦）','AI 4인 최종 모의전 테스트 (방장은 관전)'],
 ['四席由AI控制，使用原版队友列表切换观察；回合时限仍生效。盟约保护由独立开关控制。','All four seats are AI-controlled. Switch views with the original teammate list; round deadlines still apply. Bond protection has its own switch.','四席由AI控制，使用原版隊友列表切換觀察；回合時限仍生效。盟約保護由獨立開關控制。','4席すべてAIです。元の味方リストで観戦対象を切り替えます。ラウンドの制限時間は有効です。盟約の保護は別のスイッチで設定します。','네 자리는 모두 AI이며 기존 팀원 목록으로 관전 대상을 바꿉니다. 라운드 제한 시간은 유지됩니다. 맹약 보호는 별도 스위치로 설정합니다.'],
 ['指定盟约不被禁用','Keep selected bonds unbanned','指定盟約不被禁用','選択した盟約を禁止対象から除外','선택한 맹약 금지 방지'],
 ['默认关闭；仅记忆勾选项，关闭或重启不会清除。','Off by default. Selections are remembered even after disabling or restarting.','預設關閉；僅記憶勾選項，關閉或重新啟動不會清除。','初期状態はオフです。選択内容はオフにしても再起動しても保持されます。','기본값은 꺼짐입니다. 해제하거나 다시 시작해도 선택 항목은 유지됩니다.'],
 ['已选择 {n} 个盟约','{n} bonds selected','已選擇 {n} 個盟約','選択中の盟約：{n}','선택한 맹약 {n}개'],
 ['保留原有禁用数量，只筛选可能出现的组合；选中盟约仍可能因地图或规则不可用。','Preserves native ban counts and selects only possible combinations. Maps or rules may still make selected bonds unavailable.','保留原有禁用數量，只篩選可能出現的組合；選中盟約仍可能因地圖或規則不可用。','元の禁止数を保ち、実現可能な組み合わせだけを選びます。マップやルールによって選択した盟約が使えない場合はあります。','원래 금지 수를 유지하며 가능한 조합만 선택합니다. 맵이나 규칙에 따라 선택한 맹약을 사용할 수 없을 수 있습니다.'],
 ['核心盟约','Core bonds','核心盟約','中核盟約','핵심 맹약'],
 ['附加盟约','Additional bonds','附加盟約','追加盟約','추가 맹약'],
 ['所选盟约过多，无法按原规则生成禁用位；请减少勾选。','Too many bonds selected for a legal native ban draw. Deselect some bonds.','所選盟約過多，無法依原規則產生禁用位；請減少勾選。','選択数が多すぎて元のルールに従う禁止対象を選べません。選択を減らしてください。','선택한 맹약이 너무 많아 원래 규칙에 맞는 금지 조합을 만들 수 없습니다. 일부 선택을 해제하세요.'],
 ['恢复四路线默认选择','Restore four-route defaults','恢復四路線預設選擇','4ルートの初期選択に戻す','4경로 기본 선택 복원'],
 ['仅房主可调整','Only the host can change this','僅房主可調整','ホストのみ変更できます','방장만 변경할 수 있습니다'],
 ['AI每步间隔','AI action interval','AI每步間隔','AIの操作間隔','AI 행동 간격'],
 ['每步 {n} 秒','{n} seconds per action','每步 {n} 秒','操作間隔 {n} 秒','행동당 {n}초'],
 ['协同AI观察设置','Coordinated AI observation settings','協同AI觀察設定','連携AIの観戦設定','협동 AI 관전 설정'],
 ['协同四路线AI · 点击原版队友栏切换观察对象','Coordinated four-route AI · Select a teammate in the original panel to switch views','協同四路線AI · 點選原版隊友欄切換觀察對象','連携4ルートAI · 元の味方パネルで観戦対象を選択','협동 4경로 AI · 기존 팀원 패널에서 관전 대상 선택'],
 ['拉特兰、谢拉格、萨尔贡、叙拉古；灵巧、精准、迅捷、奥术、远见、奇迹','Laterano, Kjerag, Sargon, Siracusa; Skillful, Precision, Swift, Arcane, Foresight, Miracle','拉特蘭、謝拉格、薩爾貢、敘拉古；靈巧、精準、迅捷、奧術、遠見、奇蹟','ラテラーノ、イェラグ、サルゴン、シラクーザ；器用、精密、迅速、秘術、先見、奇跡','라테라노, 쉐라그, 사르곤, 시라쿠사; 기교, 정밀, 신속, 비술, 선견, 기적'],
];
export const ROUTE_TRANSLATIONS=Object.fromEntries(['en','zh-TW','ja','ko'].map((lang,index)=>[lang,Object.fromEntries(rows.map(row=>[row[0],row[index+1]]))]));
