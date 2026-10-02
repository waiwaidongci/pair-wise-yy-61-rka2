import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { maintenanceApi } from './api';

export type StageSignature = { stage: string; status: '待签署' | '已签署'; actor: string; time: string; invalid: boolean };
export type OfflineCard = {
  id: string;
  title: string;
  estimated: number;
  zone: string;
  dependencies: string[];
  tolerance: string;
  evidence: string;
  witness: string;
  status: '未开始' | '执行中' | '待授权' | '已完成';
  measurement: string;
  finding: string;
  stage: string;
  revision: string;
};

export type Gauge = {
  id: string;
  name: string;
  range: string;
  certNo: string;
  certStatus: '有效' | '到期' | '已撤';
  certExpiry: string;
  occupiedBy: string | null;
  occupiedAt: string | null;
};

export type MeasurementRecord = {
  id: string;
  cardId: string;
  gaugeId: string;
  gaugeName: string;
  certNo: string;
  certStatus: string;
  value: string;
  measuredAt: string;
  inspector: string;
  status: '有效' | '失效' | '待复测';
  invalidReason: string;
  originalValue: string | null;
  retestConfirmedBy: string | null;
  retestConfirmedAt: string | null;
  idempotencyKey: string;
  writeFailed: boolean;
};

type MaintenanceState = {
  cards: OfflineCard[];
  activeCardId: string;
  syncVersion: number;
  serverVersion: number;
  offline: boolean;
  lastSaved: string;
  conflictMessage: string;
  signatures: StageSignature[];
  released: boolean;
  gauges: Gauge[];
  measurements: MeasurementRecord[];
  chainVersion: number;
  audit: { time: string; actor: string; action: string; detail: string }[];
};

const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

const initialCards: OfflineCard[] = [
  { id: 'CARD-01', title: '右主起落架收放检查', zone: '起落架舱 RH', estimated: 3.5, dependencies: [], tolerance: '间隙 1.2–2.0 mm', evidence: '近照 + 动作记录', witness: '检验员', status: '已完成', measurement: '1.62 mm', finding: '正常', stage: '机械签署', revision: 'R7' },
  { id: 'CARD-02', title: '发动机 2 风扇叶片孔探', zone: '发动机 2', estimated: 4.2, dependencies: ['CARD-01'], tolerance: '凹坑 ≤ 0.3 mm', evidence: '孔探照片 + 视频', witness: '发动机工程师', status: '执行中', measurement: '', finding: '', stage: '发动机签署', revision: 'R7' },
  { id: 'CARD-03', title: '液压系统压力保持测试', zone: '轮舱 / 系统 A', estimated: 2.0, dependencies: ['CARD-01'], tolerance: '≥ 2850 psi / 10 min', evidence: '压力仪记录', witness: '质量检验', status: '待授权', measurement: '2762 psi', finding: '低于容差，等待授权', stage: '系统签署', revision: 'R7' },
  { id: 'CARD-04', title: '前起落架时寿件核对', zone: '前起落架', estimated: 1.5, dependencies: [], tolerance: '剩余循环 ≥ 500', evidence: '件号照片 + 履历页', witness: '检验员', status: '已完成', measurement: '剩余 836 循环', finding: '正常', stage: '适航签署', revision: 'R7' },
  { id: 'CARD-05', title: 'AD 2024-15-03 执行确认', zone: '机身后段', estimated: 2.5, dependencies: ['CARD-04'], tolerance: '按 AD 标准施工', evidence: '施工记录 + 签署', witness: '放行人员', status: '未开始', measurement: '', finding: '', stage: '适航签署', revision: 'R7' },
  { id: 'CARD-06', title: '客舱应急设备检查', zone: '客舱全舱', estimated: 2.8, dependencies: [], tolerance: '全部在有效期内', evidence: '清单复核', witness: '客舱检验', status: '未开始', measurement: '', finding: '', stage: '客舱签署', revision: 'R7' },
  { id: 'CARD-07', title: 'APU 排故后试车', zone: 'APU 舱', estimated: 3.0, dependencies: ['CARD-03'], tolerance: '参数在 AMM 范围', evidence: '试车数据 + 油样', witness: '动力工程师', status: '未开始', measurement: '', finding: '', stage: '动力签署', revision: 'R7' },
  { id: 'CARD-08', title: '重复缺陷趋势复核', zone: '全机', estimated: 1.0, dependencies: ['CARD-02', 'CARD-03'], tolerance: '无新增重复缺陷', evidence: '近 3 次记录', witness: '质量经理', status: '执行中', measurement: '发现 2 次压力偏低', finding: '移交可靠性分析', stage: '放行签署', revision: 'R7' }
];

const defaultSignatures: StageSignature[] = [
  { stage: '机械', status: '已签署', actor: '赵明 · 机械师', time: '09:18', invalid: false },
  { stage: '系统', status: '待签署', actor: '待指定', time: '-', invalid: false },
  { stage: '动力', status: '待签署', actor: '待指定', time: '-', invalid: false },
  { stage: '放行', status: '待签署', actor: '质量经理', time: '-', invalid: false }
];

const defaultGauges: Gauge[] = [
  { id: 'PG-01', name: '液压压力表 A', range: '0–5000 psi', certNo: 'CAL-2026-0142', certStatus: '有效', certExpiry: '2027-03-31', occupiedBy: null, occupiedAt: null },
  { id: 'PG-02', name: '液压压力表 B', range: '0–5000 psi', certNo: 'CAL-2025-0877', certStatus: '到期', certExpiry: '2026-08-31', occupiedBy: null, occupiedAt: null },
  { id: 'PG-03', name: '液压压力表 C', range: '0–6000 psi', certNo: 'CAL-2026-0203', certStatus: '已撤', certExpiry: '2026-06-15', occupiedBy: null, occupiedAt: null },
  { id: 'PG-04', name: '液压压力表 D', range: '0–4000 psi', certNo: 'CAL-2026-0311', certStatus: '有效', certExpiry: '2027-01-20', occupiedBy: null, occupiedAt: null }
];

const defaultState: MaintenanceState = {
  cards: initialCards,
  activeCardId: 'CARD-03',
  syncVersion: 7,
  serverVersion: 7,
  offline: false,
  lastSaved: '09:46',
  conflictMessage: '',
  signatures: defaultSignatures,
  released: false,
  gauges: defaultGauges,
  measurements: [],
  chainVersion: 0,
  audit: [
    { time: '08:54', actor: '赵明', action: '完成工卡', detail: 'CARD-01 间隙测量 1.62 mm' },
    { time: '09:05', actor: '宋杰', action: '提交测量', detail: 'CARD-03 压力 2762 psi，低于容差' },
    { time: '09:20', actor: '系统', action: '阻断', detail: 'CARD-03 等待授权处理' }
  ]
};

const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('yy61-work-package') : null;
const saved = raw ? JSON.parse(raw) : null;
const initialState: MaintenanceState = saved
  ? {
      ...defaultState,
      ...saved,
      signatures: (saved.signatures ?? defaultSignatures).map((item: StageSignature) => ({ ...item, invalid: item.invalid ?? false })),
      gauges: saved.gauges ?? defaultGauges,
      measurements: saved.measurements ?? []
    }
  : defaultState;

function nextMeasurementId(state: MaintenanceState) {
  const nums = state.measurements
    .map((item) => Number.parseInt(item.id.replace('M-', ''), 10))
    .filter((num) => !Number.isNaN(num));
  return `M-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

/** 链失效：关联测量与阶段签字立即作废，原值保留待复测，放行基线回退。 */
function invalidateChain(state: MaintenanceState, reason: string, predicate: (record: MeasurementRecord) => boolean) {
  state.chainVersion += 1;
  const affectedCards = new Set<string>();
  for (const record of state.measurements) {
    if (record.status === '有效' && predicate(record)) {
      record.status = '失效';
      record.invalidReason = reason;
      if (record.originalValue == null) record.originalValue = record.value;
      affectedCards.add(record.cardId);
    }
  }
  for (const cardId of affectedCards) {
    const card = state.cards.find((item) => item.id === cardId);
    if (!card) continue;
    const stageName = card.stage.replace('签署', '');
    const signature = state.signatures.find((item) => item.stage === stageName);
    if (signature && signature.status === '已签署') {
      signature.status = '待签署';
      signature.actor = '待指定';
      signature.time = '-';
      signature.invalid = true;
    }
  }
  if (state.released) {
    state.released = false;
    state.audit.unshift({ time: now(), actor: '质量经理', action: '基线回退', detail: `放行基线失效：${reason}` });
  }
  state.audit.unshift({ time: now(), actor: '系统', action: '链失效', detail: reason });
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
    authorizeOverride(state) {
      const card = state.cards.find((item) => item.id === state.activeCardId);
      if (!card) return;
      card.status = '执行中';
      card.finding = '超差已由授权人员批准，按工程指令继续';
      state.audit.unshift({ time: now(), actor: '放行授权人', action: '授权继续', detail: `${card.id} 超差放行审批` });
    },
    signStage(state, action: PayloadAction<string>) {
      const signature = state.signatures.find((item) => item.stage === action.payload);
      if (!signature) return;
      signature.status = '已签署';
      signature.actor = `${action.payload}负责人`;
      signature.time = now();
      signature.invalid = false;
      state.audit.unshift({ time: signature.time, actor: signature.actor, action: '阶段签署', detail: `${action.payload}阶段确认完成` });
    },
    claimGauge(state, action: PayloadAction<{ cardId: string; gaugeId: string }>) {
      const { cardId, gaugeId } = action.payload;
      const gauge = state.gauges.find((item) => item.id === gaugeId);
      if (!gauge) {
        state.conflictMessage = '压力表不存在。';
        return;
      }
      if (gauge.certStatus !== '有效') {
        state.conflictMessage = `压力表 ${gauge.name} 校准证${gauge.certStatus}（${gauge.certNo}），禁止占用。`;
        state.audit.unshift({ time: now(), actor: '系统', action: '占用拒绝', detail: `${gauge.name} 校准证${gauge.certStatus}` });
        return;
      }
      if (gauge.occupiedBy && gauge.occupiedBy !== cardId) {
        state.conflictMessage = `先到者占用：压力表 ${gauge.name} 已被工卡 ${gauge.occupiedBy} 占用。`;
        state.audit.unshift({ time: now(), actor: '系统', action: '占用冲突', detail: `${gauge.name} 已被 ${gauge.occupiedBy} 先到占用` });
        return;
      }
      gauge.occupiedBy = cardId;
      gauge.occupiedAt = now();
      state.conflictMessage = '';
      state.audit.unshift({ time: now(), actor: '当前用户', action: '占用压力表', detail: `${cardId} 占用 ${gauge.name}（${gauge.certNo}）` });
    },
    releaseGauge(state, action: PayloadAction<{ cardId: string }>) {
      for (const gauge of state.gauges) {
        if (gauge.occupiedBy === action.payload.cardId) {
          gauge.occupiedBy = null;
          gauge.occupiedAt = null;
        }
      }
    },
    submitMeasurement(
      state,
      action: PayloadAction<{ cardId: string; gaugeId: string; value: string; inspector: string; idempotencyKey: string; simulateFail?: boolean }>
    ) {
      const { cardId, gaugeId, value, inspector, idempotencyKey, simulateFail } = action.payload;
      // 幂等：同一请求重复提交（含失败后按原请求恢复）直接恢复已写入记录
      const existing = state.measurements.find((item) => item.idempotencyKey === idempotencyKey);
      if (existing) {
        existing.writeFailed = false;
        existing.status = '有效';
        const occupiedGauge = state.gauges.find((item) => item.id === existing.gaugeId);
        if (occupiedGauge) {
          occupiedGauge.occupiedBy = null;
          occupiedGauge.occupiedAt = null;
        }
        state.conflictMessage = '';
        state.syncVersion += 1;
        state.audit.unshift({ time: now(), actor: inspector, action: '按原请求恢复', detail: `${existing.id} 幂等键 ${idempotencyKey} 写入恢复，占用释放` });
        return;
      }
      const gauge = state.gauges.find((item) => item.id === gaugeId);
      if (!gauge) {
        state.conflictMessage = '压力表不存在。';
        return;
      }
      const record: MeasurementRecord = {
        id: nextMeasurementId(state),
        cardId,
        gaugeId,
        gaugeName: gauge.name,
        certNo: gauge.certNo,
        certStatus: gauge.certStatus,
        value,
        measuredAt: now(),
        inspector,
        status: simulateFail ? '待复测' : '有效',
        invalidReason: '',
        originalValue: null,
        retestConfirmedBy: null,
        retestConfirmedAt: null,
        idempotencyKey,
        writeFailed: Boolean(simulateFail)
      };
      state.measurements.unshift(record);
      if (simulateFail) {
        state.conflictMessage = '写入失败：压力表占用与现场读数已保留，请按原请求恢复。';
        state.audit.unshift({ time: now(), actor: inspector, action: '写入失败', detail: `${record.id} 现场读数 ${value} 已保留，占用保持` });
        return;
      }
      gauge.occupiedBy = null;
      gauge.occupiedAt = null;
      state.conflictMessage = '';
      state.audit.unshift({ time: now(), actor: inspector, action: '提交测量', detail: `${cardId} ${value}，表 ${gauge.name}（${gauge.certNo}）` });
    },
    confirmRetest(state, action: PayloadAction<{ measurementId: string; authorizedBy: string }>) {
      const record = state.measurements.find((item) => item.id === action.payload.measurementId);
      if (!record) return;
      record.status = '待复测';
      record.retestConfirmedBy = action.payload.authorizedBy;
      record.retestConfirmedAt = now();
      state.audit.unshift({ time: now(), actor: action.payload.authorizedBy, action: '确认复测', detail: `${record.id} 原读数 ${record.originalValue ?? record.value} 保留，授权复测` });
    },
    retestMeasurement(state, action: PayloadAction<{ measurementId: string; gaugeId: string; value: string; inspector: string }>) {
      const oldRecord = state.measurements.find((item) => item.id === action.payload.measurementId);
      if (!oldRecord) return;
      const gauge = state.gauges.find((item) => item.id === action.payload.gaugeId);
      if (!gauge || gauge.certStatus !== '有效') {
        state.conflictMessage = '复测必须占用有效压力表。';
        return;
      }
      oldRecord.status = '失效';
      oldRecord.invalidReason = `已由 ${action.payload.inspector} 复测，原读数保留`;
      if (oldRecord.originalValue == null) oldRecord.originalValue = oldRecord.value;
      const record: MeasurementRecord = {
        id: nextMeasurementId(state),
        cardId: oldRecord.cardId,
        gaugeId: gauge.id,
        gaugeName: gauge.name,
        certNo: gauge.certNo,
        certStatus: gauge.certStatus,
        value: action.payload.value,
        measuredAt: now(),
        inspector: action.payload.inspector,
        status: '有效',
        invalidReason: '',
        originalValue: null,
        retestConfirmedBy: oldRecord.retestConfirmedBy,
        retestConfirmedAt: oldRecord.retestConfirmedAt,
        idempotencyKey: `${oldRecord.id}-retest`,
        writeFailed: false
      };
      state.measurements.unshift(record);
      gauge.occupiedBy = null;
      gauge.occupiedAt = null;
      state.conflictMessage = '';
      state.audit.unshift({ time: now(), actor: action.payload.inspector, action: '复测完成', detail: `${oldRecord.cardId} 新读数 ${action.payload.value}，原读数 ${oldRecord.originalValue ?? oldRecord.value} 保留` });
    },
    changeGaugeCertStatus(state, action: PayloadAction<{ gaugeId: string; certStatus: Gauge['certStatus'] }>) {
      const gauge = state.gauges.find((item) => item.id === action.payload.gaugeId);
      if (!gauge) return;
      gauge.certStatus = action.payload.certStatus;
      invalidateChain(state, `压力表 ${gauge.name} 校准证${action.payload.certStatus}（${gauge.certNo}）`, (record) => record.gaugeId === gauge.id);
    },
    changeGaugeRange(state, action: PayloadAction<{ gaugeId: string; range: string }>) {
      const gauge = state.gauges.find((item) => item.id === action.payload.gaugeId);
      if (!gauge) return;
      gauge.range = action.payload.range;
      invalidateChain(state, `压力表 ${gauge.name} 量程变更为 ${action.payload.range}`, (record) => record.gaugeId === gauge.id);
    },
    bumpCardRevision(state, action: PayloadAction<{ cardId: string }>) {
      const card = state.cards.find((item) => item.id === action.payload.cardId);
      if (!card) return;
      const revisionNum = Number.parseInt(card.revision.replace('R', ''), 10) || 0;
      card.revision = `R${revisionNum + 1}`;
      invalidateChain(state, `工卡 ${card.id} 版本变更为 ${card.revision}`, (record) => record.cardId === card.id);
    },
    releasePackage(state) {
      const hasBlockers = state.cards.some((card) => card.status === '待授权');
      const allSigned = state.signatures.every((item) => item.status === '已签署' && !item.invalid);
      const chainBroken = state.measurements.some((record) => record.status === '失效');
      if (!hasBlockers && allSigned && !chainBroken) {
        state.released = true;
        state.audit.unshift({ time: now(), actor: '质量经理', action: '锁定放行', detail: '工作包 R7 已锁定并形成放行基线' });
      } else if (chainBroken) {
        state.conflictMessage = '测量链存在失效记录，复测并重新签署前不能放行。';
      }
    }
  }
});

export const {
  selectCard,
  updateCard,
  setConflict,
  refreshVersion,
  toggleOffline,
  authorizeOverride,
  signStage,
  releasePackage,
  claimGauge,
  releaseGauge,
  submitMeasurement,
  confirmRetest,
  retestMeasurement,
  changeGaugeCertStatus,
  changeGaugeRange,
  bumpCardRevision
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
