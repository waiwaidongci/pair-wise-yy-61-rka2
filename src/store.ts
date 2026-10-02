import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { maintenanceApi } from './api';

export type CardStatus = '未开始' | '执行中' | '待授权' | '待复测' | '已完成';
export type CalibStatus = '有效' | '到期' | '撤证';
export type ChainStatus = '有效' | '已失效' | '待复测确认';
export type SignatureStatus = '待签署' | '已签署' | '已失效';
export type InvalidateReason = '校准证到期' | '校准证撤销' | '量程变更' | '工卡版本变更';

export type StageSignature = { stage: string; status: SignatureStatus; actor: string; time: string };
export type OfflineCard = {
  id: string;
  title: string;
  estimated: number;
  zone: string;
  dependencies: string[];
  tolerance: string;
  evidence: string;
  witness: string;
  status: CardStatus;
  measurement: string;
  finding: string;
  stage: string;
  cardRevision: string;
  pressure: boolean;
  requiredMinPsi: number | null;
};

export type PressureGauge = {
  id: string;
  name: string;
  serial: string;
  rangeMaxPsi: number;
  rangeMinPsi: number;
  calibStatus: CalibStatus;
  calibDue: string;
  certNo: string;
  occupiedByCard: string | null;
  occupiedBy: string | null;
  occupiedSince: string;
};

export type PressureChain = {
  cardId: string;
  gaugeId: string;
  gaugeSerial: string;
  certNo: string;
  calibStatusAtRead: CalibStatus;
  rangeMaxAtRead: number;
  rangeMinAtRead: number;
  cardRevision: string;
  reading: string;
  psi: number;
  measuredBy: string;
  measuredAt: string;
  status: ChainStatus;
  invalidReason: InvalidateReason | '';
  invalidatedAt: string;
  /** 原值保留：失效后保留的现场读数 */
  retainedReading: string;
  /** 复测链：原读数历史 */
  history: { reading: string; gaugeId: string; certNo: string; at: string }[];
  qaConfirmedBy: string;
};

export type PendingWrite = {
  id: string;
  kind: '测量' | '复测';
  cardId: string;
  gaugeId: string;
  reading: string;
  measuredBy: string;
  failedAt: string;
  note: string;
  attempts: number;
};

export type ContentionLog = { time: string; gaugeId: string; winner: string; loser: string; cardId: string; result: string };

export type ReleaseBaseline = {
  frozenAt: string;
  frozenBy: string;
  serverRevision: number;
  chainSnapshot: { cardId: string; gaugeId: string; certNo: string; reading: string; status: ChainStatus }[];
  signatureSnapshot: { stage: string; actor: string; time: string }[];
  checksum: string;
};

type MaintenanceState = {
  cards: OfflineCard[];
  gauges: PressureGauge[];
  chains: PressureChain[];
  pendingWrites: PendingWrite[];
  contention: ContentionLog[];
  activeCardId: string;
  syncVersion: number;
  serverVersion: number;
  offline: boolean;
  lastSaved: string;
  conflictMessage: string;
  signatures: StageSignature[];
  released: boolean;
  baseline: ReleaseBaseline | null;
  failWrites: boolean;
  qaAuthorized: string[];
  inspectors: string[];
  audit: { time: string; actor: string; action: string; detail: string }[];
};

const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const STAGE_ORDER = ['机械', '系统', '动力', '放行'];
const stageOf = (cardStage: string) => STAGE_ORDER.find((s) => cardStage.startsWith(s)) ?? '';

const initialCards: OfflineCard[] = [
  { id: 'CARD-01', title: '右主起落架收放检查', zone: '起落架舱 RH', estimated: 3.5, dependencies: [], tolerance: '间隙 1.2–2.0 mm', evidence: '近照 + 动作记录', witness: '检验员', status: '已完成', measurement: '1.62 mm', finding: '正常', stage: '机械签署', cardRevision: 'R7', pressure: false, requiredMinPsi: null },
  { id: 'CARD-02', title: '发动机 2 风扇叶片孔探', zone: '发动机 2', estimated: 4.2, dependencies: ['CARD-01'], tolerance: '凹坑 ≤ 0.3 mm', evidence: '孔探照片 + 视频', witness: '发动机工程师', status: '执行中', measurement: '', finding: '', stage: '发动机签署', cardRevision: 'R7', pressure: false, requiredMinPsi: null },
  { id: 'CARD-03', title: '液压系统压力保持测试', zone: '轮舱 / 系统 A', estimated: 2.0, dependencies: ['CARD-01'], tolerance: '≥ 2850 psi / 10 min', evidence: '压力仪记录', witness: '质量检验', status: '待复测', measurement: '2762 psi', finding: '原测量保留待复测', stage: '系统签署', cardRevision: 'R6', pressure: true, requiredMinPsi: 2850 },
  { id: 'CARD-04', title: '前起落架时寿件核对', zone: '前起落架', estimated: 1.5, dependencies: [], tolerance: '剩余循环 ≥ 500', evidence: '件号照片 + 履历页', witness: '检验员', status: '已完成', measurement: '剩余 836 循环', finding: '正常', stage: '适航签署', cardRevision: 'R7', pressure: false, requiredMinPsi: null },
  { id: 'CARD-05', title: 'AD 2024-15-03 执行确认', zone: '机身后段', estimated: 2.5, dependencies: ['CARD-04'], tolerance: '按 AD 标准施工', evidence: '施工记录 + 签署', witness: '放行人员', status: '未开始', measurement: '', finding: '', stage: '适航签署', cardRevision: 'R7', pressure: false, requiredMinPsi: null },
  { id: 'CARD-06', title: '客舱应急设备检查', zone: '客舱全舱', estimated: 2.8, dependencies: [], tolerance: '全部在有效期内', evidence: '清单复核', witness: '客舱检验', status: '未开始', measurement: '', finding: '', stage: '客舱签署', cardRevision: 'R7', pressure: false, requiredMinPsi: null },
  { id: 'CARD-07', title: 'APU 排故后试车', zone: 'APU 舱', estimated: 3.0, dependencies: ['CARD-03'], tolerance: '液压 ≥ 2850 psi，参数在 AMM 范围', evidence: '试车数据 + 油样', witness: '动力工程师', status: '未开始', measurement: '', finding: '', stage: '动力签署', cardRevision: 'R5', pressure: true, requiredMinPsi: 2850 },
  { id: 'CARD-08', title: '重复缺陷趋势复核', zone: '全机', estimated: 1.0, dependencies: ['CARD-02', 'CARD-03'], tolerance: '无新增重复缺陷', evidence: '近 3 次记录', witness: '质量经理', status: '执行中', measurement: '发现 2 次压力偏低', finding: '移交可靠性分析', stage: '放行签署', cardRevision: 'R7', pressure: false, requiredMinPsi: null }
];

const initialGauges: PressureGauge[] = [
  { id: 'PG-101', name: '液压压力表 · 主用', serial: 'PG-101', rangeMaxPsi: 4000, rangeMinPsi: 0, calibStatus: '到期', calibDue: '2026-09-30', certNo: 'CAL-2026-3301', occupiedByCard: null, occupiedBy: null, occupiedSince: '' },
  { id: 'PG-102', name: '液压压力表 · 备用 A', serial: 'PG-102', rangeMaxPsi: 5000, rangeMinPsi: 0, calibStatus: '有效', calibDue: '2026-12-15', certNo: 'CAL-2026-4107', occupiedByCard: null, occupiedBy: null, occupiedSince: '' },
  { id: 'PG-103', name: '液压压力表 · 备用 B', serial: 'PG-103', rangeMaxPsi: 3000, rangeMinPsi: 0, calibStatus: '有效', calibDue: '2026-11-02', certNo: 'CAL-2026-4112', occupiedByCard: null, occupiedBy: null, occupiedSince: '' },
  { id: 'PG-104', name: '液压压力表 · 高压', serial: 'PG-104', rangeMaxPsi: 6000, rangeMinPsi: 0, calibStatus: '撤证', calibDue: '—', certNo: 'CAL-2025-9023（撤销）', occupiedByCard: null, occupiedBy: null, occupiedSince: '' },
  { id: 'PG-105', name: '液压压力表 · 低量程', serial: 'PG-105', rangeMaxPsi: 2500, rangeMinPsi: 0, calibStatus: '有效', calibDue: '2026-10-20', certNo: 'CAL-2026-4208', occupiedByCard: null, occupiedBy: null, occupiedSince: '' }
];

const initialChains: PressureChain[] = [
  {
    cardId: 'CARD-03',
    gaugeId: 'PG-101',
    gaugeSerial: 'PG-101',
    certNo: 'CAL-2026-3301',
    calibStatusAtRead: '有效',
    rangeMaxAtRead: 4000,
    rangeMinAtRead: 0,
    cardRevision: 'R6',
    reading: '2762 psi',
    psi: 2762,
    measuredBy: '宋杰',
    measuredAt: '09:05',
    status: '已失效',
    invalidReason: '校准证到期',
    invalidatedAt: '09:40',
    retainedReading: '2762 psi',
    history: [{ reading: '2762 psi', gaugeId: 'PG-101', certNo: 'CAL-2026-3301', at: '09:05' }],
    qaConfirmedBy: ''
  }
];

const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('yy61-work-package') : null;
const saved = raw ? JSON.parse(raw) : null;

const defaultState: MaintenanceState = {
  cards: initialCards,
  gauges: initialGauges,
  chains: initialChains,
  pendingWrites: [],
  contention: [
    { time: '09:12', gaugeId: 'PG-102', winner: '宋杰（CARD-03）', loser: '韩磊（CARD-07）', cardId: 'CARD-03', result: '先到者占用 PG-102，后到请求拒绝' }
  ],
  activeCardId: 'CARD-03',
  syncVersion: 7,
  serverVersion: 7,
  offline: false,
  lastSaved: '09:46',
  conflictMessage: '',
  signatures: [
    { stage: '机械', status: '已签署', actor: '赵明 · 机械师', time: '09:18' },
    { stage: '系统', status: '已失效', actor: '宋杰 · 质量检验', time: '09:08' },
    { stage: '动力', status: '待签署', actor: '待指定', time: '-' },
    { stage: '放行', status: '待签署', actor: '质量经理', time: '-' }
  ],
  released: false,
  baseline: null,
  failWrites: false,
  qaAuthorized: ['林岚 · 质量授权人'],
  inspectors: ['宋杰 · 机械检验', '韩磊 · 液压检验'],
  audit: [
    { time: '08:54', actor: '赵明', action: '完成工卡', detail: 'CARD-01 间隙测量 1.62 mm' },
    { time: '09:05', actor: '宋杰', action: '压力测量', detail: 'CARD-03 使用 PG-101（CAL-2026-3301）记录 2762 psi' },
    { time: '09:08', actor: '宋杰', action: '阶段签字', detail: '系统阶段基于 PG-101 测量签字' },
    { time: '09:12', actor: '系统', action: '占用冲突', detail: '宋杰与韩磊同时请求 PG-102：先到者宋杰占用，韩磊被拒绝' },
    { time: '09:40', actor: '系统', action: '级联失效', detail: 'PG-101 校准证 CAL-2026-3301 到期：CARD-03 测量、系统签字立即失效，原值 2762 psi 保留待复测' },
    { time: '09:41', actor: '系统', action: '放行拦截', detail: '存在失效压力链，旧测量与旧签字不得随工作包放行' }
  ]
};

// 兼容旧版 localStorage 草稿：补齐压力表链所需字段
const migrate = (s: MaintenanceState): MaintenanceState => ({
  ...defaultState,
  ...s,
  gauges: s.gauges ?? defaultState.gauges,
  chains: s.chains ?? defaultState.chains,
  pendingWrites: s.pendingWrites ?? [],
  contention: s.contention ?? defaultState.contention,
  baseline: s.baseline ?? null,
  failWrites: s.failWrites ?? false,
  qaAuthorized: s.qaAuthorized ?? defaultState.qaAuthorized,
  inspectors: s.inspectors ?? defaultState.inspectors,
  cards: ((s.cards ?? initialCards) as Partial<OfflineCard>[]).map((c) => ({
    ...initialCards.find((i) => i.id === c.id),
    ...c,
    cardRevision: c.cardRevision ?? (c as { revision?: string }).revision ?? initialCards.find((i) => i.id === c.id)?.cardRevision ?? 'R7',
    pressure: c.pressure ?? initialCards.find((i) => i.id === c.id)?.pressure ?? false,
    requiredMinPsi: c.requiredMinPsi ?? initialCards.find((i) => i.id === c.id)?.requiredMinPsi ?? null,
    status: c.status ?? '未开始'
  })) as OfflineCard[],
  signatures: (s.signatures ?? defaultState.signatures).map((sig: StageSignature) => ({ ...sig }))
});

const initialState: MaintenanceState = saved ? migrate(saved as MaintenanceState) : defaultState;

/** 级联失效：测量链 → 阶段签字（本阶段及其后已签字阶段全部失效），原值保留 */
function invalidateChain(state: MaintenanceState, cardId: string, reason: InvalidateReason) {
  const chain = state.chains.find((c) => c.cardId === cardId);
  const card = state.cards.find((c) => c.id === cardId);
  if (!chain || !card || chain.status === '已失效') {
    if (chain && card && chain.status === '已失效') return;
    return;
  }
  chain.invalidReason = reason;
  chain.invalidatedAt = now();
  chain.status = '已失效';
  chain.retainedReading = chain.reading;
  card.status = '待复测';
  card.finding = `${reason}：原测量 ${chain.reading} 已失效并保留，待质量授权复测`;

  const stageName = stageOf(card.stage);
  const fromIndex = STAGE_ORDER.indexOf(stageName);
  if (fromIndex >= 0) {
    state.signatures.forEach((sig) => {
      const idx = STAGE_ORDER.indexOf(sig.stage);
      if (idx >= fromIndex && sig.status === '已签署') {
        sig.status = '已失效';
      }
    });
  }
  state.released = false;
  state.audit.unshift({
    time: now(),
    actor: '系统',
    action: '级联失效',
    detail: `${cardId} 因${reason}：压力测量（${chain.gaugeId} ${chain.retainedReading}）及关联阶段签字立即失效，原值保留待复测`
  });
}

type RecordPayload = {
  cardId: string;
  gaugeId: string;
  reading: string;
  actor: string;
  kind: '测量' | '复测';
  force?: boolean;
};

/**
 * 占用 + 写入一条压力链：两名检验员同时提交同一只表时先到者占用。
 * 写入失败（故障注入）时保留占用和现场读数，生成待恢复请求。
 */
function recordPressure(state: MaintenanceState, p: RecordPayload): string {
  const card = state.cards.find((c) => c.id === p.cardId);
  const gauge = state.gauges.find((g) => g.id === p.gaugeId);
  if (!card || !gauge) return '工卡或压力表不存在。';
  if (state.released) return '工作包已锁定形成放行基线，基线只读，不能再写入测量。';
  const psi = Number.parseFloat(p.reading.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(psi) || psi <= 0) return '现场读数无效：请输入数值压力（psi）。';

  // 占用竞争：先到者占用同一只表
  if (gauge.occupiedByCard && gauge.occupiedByCard !== p.cardId) {
    state.contention.unshift({
      time: now(),
      gaugeId: gauge.id,
      winner: `${gauge.occupiedBy ?? '先到者'}（${gauge.occupiedByCard}）`,
      loser: `${p.actor}（${p.cardId}）`,
      cardId: p.cardId,
      result: '同时提交：后到请求拒绝，未获得占用'
    });
    state.audit.unshift({ time: now(), actor: p.actor, action: '占用冲突', detail: `${p.actor} 请求 ${gauge.id} 被拒：已由 ${gauge.occupiedBy}（${gauge.occupiedByCard}）先占用` });
    return `占用冲突：${gauge.id} 已被 ${gauge.occupiedBy}（${gauge.occupiedByCard}）先占用，先到者得。`;
  }

  const existing = state.chains.find((c) => c.cardId === p.cardId);
  if (p.kind === '复测' && (!existing || existing.status !== '已失效')) {
    return '只有已失效的测量链允许复测提交。';
  }
  if (p.kind === '测量' && existing && existing.status === '待复测确认') {
    return '复测结果待质量授权人确认，不能再次写入测量。';
  }

  // 校准状态 / 量程门禁（占用前校验，无效表不得占用）
  if (gauge.calibStatus !== '有效') return `${gauge.id} 校准证${gauge.calibStatus === '撤证' ? '已撤销' : '已到期'}，不得占用测量。`;
  if (card.requiredMinPsi !== null && gauge.rangeMaxPsi < card.requiredMinPsi) {
    return `${gauge.id} 量程上限 ${gauge.rangeMaxPsi} psi 小于工卡要求 ${card.requiredMinPsi} psi，量程不覆盖。`;
  }
  if (psi > gauge.rangeMaxPsi || psi < gauge.rangeMinPsi) {
    return `读数 ${psi} psi 超出 ${gauge.id} 量程 ${gauge.rangeMinPsi}–${gauge.rangeMaxPsi} psi。`;
  }

  // 先到者占用（原子：占用与读数登记一起完成；失败则二者都保留）
  if (!gauge.occupiedByCard) {
    gauge.occupiedByCard = p.cardId;
    gauge.occupiedBy = p.actor;
    gauge.occupiedSince = now();
  }

  // 故障注入：写入失败，保留占用与现场读数，按原请求待恢复
  if (state.failWrites && !p.force) {
    state.pendingWrites.unshift({
      id: `PW-${Date.now()}`,
      kind: p.kind,
      cardId: p.cardId,
      gaugeId: p.gaugeId,
      reading: p.reading,
      measuredBy: p.actor,
      failedAt: now(),
      note: '写入失败：占用与现场读数已保留，待恢复后按原请求重放',
      attempts: 1
    });
    state.audit.unshift({ time: now(), actor: '系统', action: '写入失败', detail: `${p.cardId} ${p.kind} ${p.reading} 写入失败：${gauge.id} 占用保留，生成待恢复请求` });
    return '写入失败：已保留压力表占用和现场读数，可在失败队列中按原请求恢复。';
  }

  // 成功落链：记录测量时的校准/量程/版本快照
  if (!existing) {
    state.chains.push({
      cardId: p.cardId,
      gaugeId: gauge.id,
      gaugeSerial: gauge.serial,
      certNo: gauge.certNo,
      calibStatusAtRead: gauge.calibStatus,
      rangeMaxAtRead: gauge.rangeMaxPsi,
      rangeMinAtRead: gauge.rangeMinPsi,
      cardRevision: card.cardRevision,
      reading: p.reading,
      psi,
      measuredBy: p.actor,
      measuredAt: now(),
      status: '有效',
      invalidReason: '',
      invalidatedAt: '',
      retainedReading: '',
      history: [{ reading: p.reading, gaugeId: gauge.id, certNo: gauge.certNo, at: now() }],
      qaConfirmedBy: ''
    });
  } else {
    existing.history.push({ reading: p.reading, gaugeId: gauge.id, certNo: gauge.certNo, at: now() });
    existing.gaugeId = gauge.id;
    existing.gaugeSerial = gauge.serial;
    existing.certNo = gauge.certNo;
    existing.calibStatusAtRead = gauge.calibStatus;
    existing.rangeMaxAtRead = gauge.rangeMaxPsi;
    existing.rangeMinAtRead = gauge.rangeMinPsi;
    existing.cardRevision = card.cardRevision;
    existing.reading = p.reading;
    existing.psi = psi;
    existing.measuredBy = p.actor;
    existing.measuredAt = now();
    existing.invalidReason = '';
    existing.invalidatedAt = '';
    existing.status = '待复测确认';
    existing.qaConfirmedBy = '';
  }

  card.measurement = p.reading;
  card.status = p.kind === '复测' ? '执行中' : psi < (card.requiredMinPsi ?? Number.POSITIVE_INFINITY) ? '待授权' : '执行中';
  card.finding = psi < (card.requiredMinPsi ?? Number.POSITIVE_INFINITY) ? '低于容差，等待授权' : '';
  state.pendingWrites = state.pendingWrites.filter((w) => !(w.cardId === p.cardId && w.gaugeId === p.gaugeId));
  state.lastSaved = now();
  state.audit.unshift({
    time: now(),
    actor: p.actor,
    action: p.kind === '复测' ? '复测提交' : '压力测量',
    detail: `${p.cardId} 占用 ${gauge.id}（${gauge.certNo}，量程 0–${gauge.rangeMaxPsi} psi）记录 ${p.reading}${p.kind === '复测' ? '，待质量授权人确认' : ''}`
  });
  return '';
}

const slice = createSlice({
  name: 'maintenance',
  initialState,
  reducers: {
    selectCard(state, action: PayloadAction<string>) {
      state.activeCardId = action.payload;
    },
    updateCard(state, action: PayloadAction<Partial<OfflineCard>>) {
      const card = state.cards.find((item) => item.id === state.activeCardId);
      if (!card) return;
      Object.assign(card, action.payload);
      state.syncVersion += 1;
      state.lastSaved = now();
      state.audit.unshift({ time: state.lastSaved, actor: '当前用户', action: '离线暂存', detail: `${card.id} 已保存本地草稿` });
    },
    setConflict(state, action: PayloadAction<string>) {
      state.conflictMessage = action.payload;
    },
    refreshVersion(state) {
      state.syncVersion = state.serverVersion;
      state.conflictMessage = '';
    },
    toggleOffline(state) {
      state.offline = !state.offline;
    },
    toggleFailWrites(state) {
      state.failWrites = !state.failWrites;
      state.audit.unshift({ time: now(), actor: '系统', action: state.failWrites ? '故障注入开' : '故障注入关', detail: state.failWrites ? '后续压力写入将失败，但占用与现场读数保留' : '恢复正常写入路径' });
    },
    authorizeOverride(state) {
      const card = state.cards.find((item) => item.id === state.activeCardId);
      if (!card) return;
      card.status = '执行中';
      card.finding = '超差已由授权人员批准，按工程指令继续';
      state.audit.unshift({ time: now(), actor: '放行授权人', action: '授权继续', detail: `${card.id} 超差放行审批（不替代压力链复测）` });
    },

    /** 占用并写入压力测量 / 复测 */
    recordPressureAction(state, action: PayloadAction<Omit<RecordPayload, 'kind'> & { kind?: '测量' | '复测' }>) {
      const error = recordPressure(state, { ...action.payload, kind: action.payload.kind ?? '测量' });
      state.conflictMessage = error;
    },

    /** 按原请求恢复失败写入：占用与读数不变，只重放落链 */
    recoverPendingWrite(state, action: PayloadAction<string>) {
      const pending = state.pendingWrites.find((w) => w.id === action.payload);
      if (!pending) return;
      const gauge = state.gauges.find((g) => g.id === pending.gaugeId);
      if (gauge && gauge.occupiedByCard && gauge.occupiedByCard !== pending.cardId) {
        state.conflictMessage = `恢复失败：${gauge.id} 占用已属于 ${gauge.occupiedByCard}。`;
        return;
      }
      if (state.failWrites) {
        pending.attempts += 1;
        state.conflictMessage = '写入通道仍故障，占用和现场读数继续保留，可稍后再恢复。';
        state.audit.unshift({ time: now(), actor: '系统', action: '恢复重试', detail: `${pending.cardId} 第 ${pending.attempts} 次恢复未成功，占用保留` });
        return;
      }
      const error = recordPressure(state, { cardId: pending.cardId, gaugeId: pending.gaugeId, reading: pending.reading, actor: pending.measuredBy, kind: pending.kind, force: true });
      if (error) {
        pending.attempts += 1;
        state.conflictMessage = `恢复被拒：${error}`;
      } else {
        state.pendingWrites = state.pendingWrites.filter((w) => w.id !== pending.id);
        state.conflictMessage = '';
      }
    },
    dismissPendingWrite(state, action: PayloadAction<string>) {
      state.pendingWrites = state.pendingWrites.filter((w) => w.id !== action.payload);
    },

    /** 质量授权人确认复测：测量链恢复有效，已失效签字回到待签署 */
    confirmRetest(state, action: PayloadAction<{ cardId: string; qa: string; basis: string }>) {
      const { cardId, qa, basis } = action.payload;
      if (!state.qaAuthorized.some((name) => name.startsWith(qa))) {
        state.conflictMessage = `${qa} 不是质量授权人，复测确认被拒绝。`;
        return;
      }
      const chain = state.chains.find((c) => c.cardId === cardId);
      const card = state.cards.find((c) => c.id === cardId);
      if (!chain || !card) return;
      if (chain.status !== '待复测确认') {
        state.conflictMessage = '该测量链没有待确认的复测结果。';
        return;
      }
      chain.status = '有效';
      chain.qaConfirmedBy = qa;
      chain.invalidReason = '';
      chain.invalidatedAt = '';
      chain.retainedReading = '';
      card.status = '执行中';
      card.finding = `复测 ${chain.reading} 已由 ${qa} 确认`;
      const fromIndex = STAGE_ORDER.indexOf(stageOf(card.stage));
      if (fromIndex >= 0) {
        state.signatures.forEach((sig) => {
          if (STAGE_ORDER.indexOf(sig.stage) >= fromIndex && sig.status === '已失效') {
            sig.status = '待签署';
            sig.actor = '待指定';
            sig.time = '-';
          }
        });
      }
      state.conflictMessage = '';
      state.audit.unshift({ time: now(), actor: qa, action: '复测确认', detail: `${cardId} 复测 ${chain.reading}（${chain.gaugeId}）经质量授权确认有效，依据：${basis}，失效签字回到待签署` });
    },

    /** 校准证状态变更：到期 / 撤证 / 复检有效，级联失效在用测量 */
    setCalibration(state, action: PayloadAction<{ gaugeId: string; status: CalibStatus; due?: string }>) {
      const gauge = state.gauges.find((g) => g.id === action.payload.gaugeId);
      if (!gauge) return;
      if (state.released) { state.conflictMessage = '放行基线只读，校准状态变更被拒绝。'; return; }
      const prev = gauge.calibStatus;
      gauge.calibStatus = action.payload.status;
      if (action.payload.due) gauge.calibDue = action.payload.due;
      state.audit.unshift({ time: now(), actor: '计量管理员', action: '校准证变更', detail: `${gauge.id} 校准状态 ${prev} → ${action.payload.status}` });
      if (action.payload.status !== '有效') {
        // 到期/撤证：释放占用并使所有用该表的有效链失效
        state.chains.filter((c) => c.gaugeId === gauge.id && c.status !== '已失效').forEach((c) => invalidateChain(state, c.cardId, action.payload.status === '撤证' ? '校准证撤销' : '校准证到期'));
        gauge.occupiedByCard = null;
        gauge.occupiedBy = null;
        gauge.occupiedSince = '';
      }
      // 复检有效不自动恢复旧测量——必须复测
      state.conflictMessage = '';
    },

    /** 量程变更：关联测量立即失效，原值保留；占用保留待复测 */
    setGaugeRange(state, action: PayloadAction<{ gaugeId: string; rangeMaxPsi: number }>) {
      const gauge = state.gauges.find((g) => g.id === action.payload.gaugeId);
      if (!gauge) return;
      if (state.released) { state.conflictMessage = '放行基线只读，量程变更被拒绝。'; return; }
      const prevMax = gauge.rangeMaxPsi;
      gauge.rangeMaxPsi = action.payload.rangeMaxPsi;
      state.chains.filter((c) => c.gaugeId === gauge.id && c.status !== '已失效').forEach((c) => invalidateChain(state, c.cardId, '量程变更'));
      state.audit.unshift({ time: now(), actor: '计量管理员', action: '量程变更', detail: `${gauge.id} 量程上限 ${prevMax} → ${action.payload.rangeMaxPsi} psi，关联测量与签字失效，占用保留待复测` });
    },

    /** 工卡版本变更：关联测量与签字立即失效，原值保留 */
    bumpCardRevision(state, action: PayloadAction<string>) {
      const card = state.cards.find((c) => c.id === action.payload);
      if (!card) return;
      if (state.released) { state.conflictMessage = '放行基线只读，工卡版本变更被拒绝。'; return; }
      const revNum = Number.parseInt(card.cardRevision.slice(1), 10) + 1;
      card.cardRevision = `R${revNum}`;
      const chain = state.chains.find((c) => c.cardId === card.id);
      if (chain && chain.status !== '已失效') invalidateChain(state, card.id, '工卡版本变更');
      state.audit.unshift({ time: now(), actor: '工程部门', action: '工卡版本变更', detail: `${card.id} 版本升为 ${card.cardRevision}，关联测量与签字失效，原值保留待复测` });
    },

    /** 两名检验员同时提交同一只表演练：先到者占用 */
    contendGauge(state, action: PayloadAction<{ gaugeId: string; firstCard: string; secondActor: string }>) {
      const p = action.payload;
      const firstInspector = state.inspectors.find((i) => !i.startsWith(p.secondActor.split(' ')[0])) ?? state.inspectors[0];
      const firstActor = firstInspector.split(' · ')[0];
      const secondName = p.secondActor.split(' · ')[0];
      const e1 = recordPressure(state, { cardId: p.firstCard, gaugeId: p.gaugeId, reading: '2876 psi', actor: firstActor, kind: '测量' });
      const secondCard = state.cards.find((c) => c.id !== p.firstCard && c.pressure && c.status !== '已完成')?.id ?? 'CARD-07';
      const e2 = recordPressure(state, { cardId: secondCard, gaugeId: p.gaugeId, reading: '2881 psi', actor: secondName, kind: '测量' });
      state.conflictMessage = e1 || e2 || `并发提交完成：${firstActor} 先到占用 ${p.gaugeId}，${secondName} 被拒绝。`;
    },

    releaseGauge(state, action: PayloadAction<string>) {
      const gauge = state.gauges.find((g) => g.occupiedByCard === action.payload);
      if (!gauge) return;
      gauge.occupiedByCard = null;
      gauge.occupiedBy = null;
      gauge.occupiedSince = '';
      state.audit.unshift({ time: now(), actor: '系统', action: '释放压力表', detail: `${action.payload} 完成，释放 ${gauge.id}` });
    },

    signStage(state, action: PayloadAction<string>) {
      if (state.released) { state.conflictMessage = '工作包已放行锁定，签字只读。'; return; }
      const signature = state.signatures.find((item) => item.stage === action.payload);
      if (!signature) return;
      // 该阶段涉及的压力链必须有效
      const blockingChain = state.chains.find((chain) => {
        const card = state.cards.find((c) => c.id === chain.cardId);
        return card && stageOf(card.stage) === action.payload && chain.status !== '有效';
      });
      if (blockingChain) {
        state.conflictMessage = `${action.payload}阶段签字被阻断：${blockingChain.cardId} 压力链${blockingChain.status === '待复测确认' ? '复测待质量授权确认' : '已失效，需复测并经质量授权确认'}。`;
        return;
      }
      signature.status = '已签署';
      signature.actor = `${action.payload}负责人`;
      signature.time = now();
      state.conflictMessage = '';
      state.audit.unshift({ time: signature.time, actor: signature.actor, action: '阶段签字', detail: `${action.payload}阶段基于有效测量链确认完成` });
    },

    releasePackage(state) {
      const gate = evaluateRelease(state);
      if (!gate.ok) {
        state.conflictMessage = `放行门禁未通过：${gate.reasons.join('；')}`;
        return;
      }
      const frozenAt = now();
      state.released = true;
      state.baseline = {
        frozenAt,
        frozenBy: '质量经理',
        serverRevision: state.serverVersion,
        chainSnapshot: state.chains.map((c) => ({ cardId: c.cardId, gaugeId: c.gaugeId, certNo: c.certNo, reading: c.reading, status: c.status })),
        signatureSnapshot: state.signatures.map((s) => ({ stage: s.stage, actor: s.actor, time: s.time })),
        checksum: baselineChecksum(state)
      };
      state.conflictMessage = '';
      state.audit.unshift({ time: frozenAt, actor: '质量经理', action: '锁定放行', detail: `工作包 R${state.serverVersion} 已锁定形成放行基线，冻结 ${state.chains.length} 条压力链与四阶段签字，校验值 ${state.baseline.checksum}` });
    }
  }
});

/** 放行门禁：失效/待确认压力链、超差、未签字任一不满足均拦截 */
export function evaluateRelease(state: MaintenanceState): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (state.chains.some((c) => c.status === '已失效')) reasons.push('存在已失效压力测量链（校准/量程/版本变更后未复测）');
  if (state.chains.some((c) => c.status === '待复测确认')) reasons.push('复测结果尚未经质量授权人确认');
  if (state.pendingWrites.length > 0) reasons.push(`${state.pendingWrites.length} 条压力写入失败未恢复`);
  if (state.cards.some((c) => c.status === '待授权')) reasons.push('存在待授权超差工卡');
  if (state.cards.some((c) => c.status === '待复测')) reasons.push('存在待复测工卡');
  if (!state.signatures.every((s) => s.status === '已签署')) reasons.push('仍有阶段未签署或签字已失效');
  return { ok: reasons.length === 0, reasons };
}

function baselineChecksum(state: MaintenanceState): string {
  const text = JSON.stringify({ chains: state.chains, sigs: state.signatures, rev: state.serverVersion });
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return hash.toString(16).toUpperCase().padStart(8, '0');
}

export const {
  selectCard,
  updateCard,
  setConflict,
  refreshVersion,
  toggleOffline,
  toggleFailWrites,
  authorizeOverride,
  recordPressureAction,
  recoverPendingWrite,
  dismissPendingWrite,
  confirmRetest,
  setCalibration,
  setGaugeRange,
  bumpCardRevision,
  contendGauge,
  releaseGauge,
  signStage,
  releasePackage
} = slice.actions;

export const store = configureStore({
  reducer: { maintenance: slice.reducer, [maintenanceApi.reducerPath]: maintenanceApi.reducer },
  middleware: (getDefault) => getDefault().concat(maintenanceApi.middleware)
});

store.subscribe(() => {
  if (typeof localStorage !== 'undefined') localStorage.setItem('yy61-work-package', JSON.stringify(store.getState().maintenance));
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
