import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Divider,
  Field,
  FluentProvider,
  Input,
  MessageBar,
  MessageBarBody,
  ProgressBar,
  Tab,
  TabList,
  Tag,
  Textarea,
  webLightTheme
} from '@fluentui/react-components';
import {
  AlertRegular,
  ArrowDownloadRegular,
  ArrowSyncRegular,
  BookOpenRegular,
  CheckmarkCircleRegular,
  ClipboardTaskListLtrRegular,
  CloudArrowUpRegular,
  CloudOffRegular,
  DocumentBulletListRegular,
  GaugeRegular,
  HistoryRegular,
  LockClosedRegular,
  NavigationRegular,
  PeopleRegular,
  WarningRegular
} from '@fluentui/react-icons';
import { useGetWorkPackageQuery, useSubmitCardMutation } from './api';
import {
  authorizeOverride,
  bumpCardRevision,
  confirmRetest,
  contendGauge,
  dismissPendingWrite,
  evaluateRelease,
  recoverPendingWrite,
  recordPressureAction,
  refreshVersion,
  releaseGauge,
  releasePackage,
  selectCard,
  setCalibration,
  setConflict,
  setGaugeRange,
  signStage,
  toggleFailWrites,
  toggleOffline,
  updateCard,
  store,
  type PressureChain,
  type RootState
} from './store';

type NavItem = { path: string; label: string; icon: ReactNode };

const calibColor = (status: string): 'success' | 'danger' | 'warning' => (status === '有效' ? 'success' : 'danger');
const chainColor = (status: string): 'success' | 'danger' | 'warning' => (status === '有效' ? 'success' : status === '待复测确认' ? 'warning' : 'danger');
const chainLabel = (status: string) => (status === '有效' ? '链有效' : status === '待复测确认' ? '待QA确认' : '链已失效');

function Shell({ children }: { children: ReactNode }) {
  const state = useSelector((root: RootState) => root.maintenance);
  const dispatch = useDispatch();
  const nav: NavItem[] = [
    { path: '/', label: '工作包总览', icon: <ClipboardTaskListLtrRegular /> },
    { path: '/execution', label: '工卡执行', icon: <BookOpenRegular /> },
    { path: '/gauges', label: '压力表与校准', icon: <GaugeRegular /> },
    { path: '/release', label: '放行审阅', icon: <LockClosedRegular /> },
    { path: '/audit', label: '审计与差异', icon: <HistoryRegular /> }
  ];
  const invalidChains = state.chains.filter((chain) => chain.status === '已失效').length;
  const pendingConfirm = state.chains.filter((chain) => chain.status === '待复测确认').length;
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon"><NavigationRegular /></div>
          <div><strong>航空定检执行台</strong><span>Maintenance Work Package</span></div>
        </div>
        <div className="aircraft-chip"><span>B-7891</span><strong>B737-800</strong><Badge appearance="tint" color="brand">48A 定检</Badge></div>
        <div className="header-spacer" />
        <button className={`sync-status ${state.failWrites ? 'offline' : ''}`} title="演练用：开启后压力测量写入会失败，但占用与现场读数保留" onClick={() => dispatch(toggleFailWrites())}>
          <AlertRegular /><span>{state.failWrites ? '写入故障注入中' : '写入正常'}</span>
        </button>
        <button className={`sync-status ${state.offline ? 'offline' : ''}`} onClick={() => dispatch(toggleOffline())}>
          {state.offline ? <CloudOffRegular /> : <CloudArrowUpRegular />}<span>{state.offline ? '离线暂存' : `已同步 R${state.syncVersion}`}</span>
        </button>
        <div className="user-chip"><span>执行人员</span><strong>宋杰 · 机械</strong></div>
      </header>
      <div className="shell-grid">
        <aside className="side-nav">
          <div className="package-summary">
            <span>工作包</span><strong>WP-B7891-04</strong><small>上海浦东 · H3 机库</small>
            <div><ProgressBar value={0.58} /><span>58% 工卡完成</span></div>
          </div>
          <nav>{nav.map((item) => <NavLink end={item.path === '/'} key={item.path} to={item.path}>{item.icon}<span>{item.label}</span></NavLink>)}</nav>
          <div className="side-status"><WarningRegular /><div><strong>{invalidChains} 条压力链失效 · {pendingConfirm} 条待QA确认</strong><span>失效测量与签字不得放行</span></div></div>
        </aside>
        <main>
          {state.pendingWrites.map((pending) => (
            <MessageBar key={pending.id} intent="warning" className="top-message pending-bar">
              <MessageBarBody>
                <strong>写入失败 · {pending.kind}请求待恢复：</strong>{pending.cardId} 占用 {pending.gaugeId}，现场读数 {pending.reading}（{pending.measuredBy} · 失败于 {pending.failedAt} · 已重试 {pending.attempts} 次）。占用与读数均已保留。
              </MessageBarBody>
              <Button appearance="primary" size="small" onClick={() => dispatch(recoverPendingWrite(pending.id))}>按原请求恢复</Button>
              <Button appearance="subtle" size="small" onClick={() => dispatch(dismissPendingWrite(pending.id))}>忽略</Button>
            </MessageBar>
          ))}
          {children}
        </main>
      </div>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><small>{eyebrow}</small><h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{actions}</div></div>;
}

function ConflictMessage() {
  const state = useSelector((root: RootState) => root.maintenance);
  const dispatch = useDispatch();
  if (!state.conflictMessage) return null;
  return <MessageBar intent="error" className="top-message"><MessageBarBody><strong>链路阻断：</strong>{state.conflictMessage}</MessageBarBody><Button appearance="secondary" size="small" onClick={() => dispatch(setConflict(''))}>知道了</Button></MessageBar>;
}

type RetestTarget = { cardId: string; gaugeId: string; reading: string; actor: string; mode: 'full' | 'confirm' };

function RetestDialog({ target, onClose }: { target: RetestTarget | null; onClose: () => void }) {
  const dispatch = useDispatch();
  const state = useSelector((root: RootState) => root.maintenance);
  const [qa, setQa] = useState(state.qaAuthorized[0]);
  const [basis, setBasis] = useState('复测使用校准合格、量程覆盖的压力表，现场见证读数稳定，符合 AMM 29-10-00。');
  useEffect(() => { if (target) { setQa(state.qaAuthorized[0]); setBasis('复测使用校准合格、量程覆盖的压力表，现场见证读数稳定，符合 AMM 29-10-00。'); } }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!target) return null;
  const submit = () => {
    if (target.mode === 'full') {
      dispatch(recordPressureAction({ cardId: target.cardId, gaugeId: target.gaugeId, reading: target.reading, actor: target.actor, kind: '复测' }));
      if (store.getState().maintenance.conflictMessage) return; // 失败（占用冲突/写入失败）时保留现场，弹窗不关闭
    }
    dispatch(confirmRetest({ cardId: target.cardId, qa, basis }));
    if (!store.getState().maintenance.conflictMessage) onClose();
  };
  return (
    <Dialog open onOpenChange={(_, data) => data.open === false && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>质量授权人确认复测 · {target.cardId}</DialogTitle>
          <DialogContent>
            原测量与阶段签字已失效，原值已保留。复测读数 <strong>{target.reading}</strong>（{target.gaugeId}）必须由质量授权人确认后才恢复有效，失效签字退回重签。
            <Field label="质量授权人" required className="dialog-field">
              <select className="native-select" value={qa} onChange={(e) => setQa(e.target.value)}>{state.qaAuthorized.map((name) => <option key={name}>{name}</option>)}</select>
            </Field>
            <Field label="确认依据 / 工程指令" required className="dialog-field"><Textarea value={basis} onChange={(_, d) => setBasis(d.value)} resize="vertical" /></Field>
          </DialogContent>
          <DialogActions><Button appearance="secondary" onClick={onClose}>取消</Button><Button appearance="primary" icon={<CheckmarkCircleRegular />} onClick={submit}>授权确认复测</Button></DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function Overview() {
  const state = useSelector((root: RootState) => root.maintenance);
  const { data } = useGetWorkPackageQuery();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const completed = state.cards.filter((card) => card.status === '已完成').length;
  const blockers = state.cards.filter((card) => card.status === '待授权' || card.status === '待复测');
  const invalidChains = state.chains.filter((chain) => chain.status !== '有效');
  return (
    <div className="page">
      <PageHeading eyebrow="WP-B7891-04 / 48A CHECK" title="工作包总览" description="监控工卡依赖、压力测量链、校准状态、阶段签字和放行门禁。" actions={<><Button appearance="secondary" icon={<ArrowDownloadRegular />}>导出进度</Button><Button appearance="primary" icon={<NavigationRegular />} onClick={() => navigate('/execution')}>继续执行</Button></>} />
      {invalidChains.length > 0 && <MessageBar intent="error" className="top-message"><MessageBarBody><strong>压力链失效：</strong>{invalidChains.map((chain) => `${chain.cardId}（${chain.invalidReason || '待QA确认'}，原值 ${chain.retainedReading || chain.reading} 保留）`).join('、')}。旧测量与阶段签字不得随工作包放行，须复测并经质量授权确认。</MessageBarBody><Button appearance="secondary" size="small" onClick={() => navigate('/gauges')}>查看校准链</Button></MessageBar>}
      {blockers.length > 0 && <MessageBar intent="warning" className="top-message"><MessageBarBody><strong>放行阻断：</strong>{blockers.map((card) => `${card.id} ${card.title}（${card.status}）`).join('、')}。</MessageBarBody></MessageBar>}
      <div className="metrics-grid">
        {[
          ['工卡完成度', `${completed} / ${state.cards.length}`, `${Math.round(completed / state.cards.length * 100)}%`, 'green'],
          ['已记录工时', '18.6 h', '计划 20.5 h', 'blue'],
          ['压力链状态', `${state.chains.filter((c) => c.status === '有效').length} 有效 / ${state.chains.length}`, `${invalidChains.length} 条失效或待确认`, invalidChains.length ? 'red' : 'green'],
          ['待签署/失效签字', String(state.signatures.filter((item) => item.status !== '已签署').length), '放行前完成', 'red']
        ].map((item) => <div className="metric-card" key={item[0]}><span>{item[0]}</span><strong>{item[1]}</strong><small className={item[3]}>{item[2]}</small></div>)}
      </div>
      <div className="overview-grid">
        <section className="panel task-panel">
          <div className="panel-head"><div><h2>关键工卡与依赖</h2><span>压力工卡绑定：压力表 → 测量 → 校准证 → 签字</span></div><Badge appearance="tint">{data?.revision ?? 'WP R7'}</Badge></div>
          {state.cards.map((card, index) => {
            const chain = state.chains.find((c) => c.cardId === card.id);
            return (
              <button key={card.id} className={`task-row ${state.activeCardId === card.id ? 'active' : ''}`} onClick={() => { dispatch(selectCard(card.id)); navigate('/execution'); }}>
                <span className={`task-index ${card.status === '已完成' ? 'done' : card.status === '待授权' || card.status === '待复测' ? 'blocked' : ''}`}>{card.status === '已完成' ? <CheckmarkCircleRegular /> : index + 1}</span>
                <span className="task-main"><strong>{card.id} · {card.title}</strong><small>{card.zone} · 版本 {card.cardRevision} · 依赖 {card.dependencies.length ? card.dependencies.join('、') : '无'}{chain ? ` · ${chain.gaugeId} / ${chain.certNo}` : ''}</small></span>
                <span className="task-tags">{card.pressure && <Tag appearance="outline" size="small" color={chain && chain.status !== '有效' ? 'danger' : 'brand'}>{chain ? chainLabel(chain.status) : '压力'}</Tag>}<Tag appearance="outline" size="small">{card.stage}</Tag></span>
                <Badge appearance="tint" color={card.status === '已完成' ? 'success' : card.status === '待授权' || card.status === '待复测' ? 'danger' : card.status === '执行中' ? 'brand' : 'informative'}>{card.status}</Badge>
              </button>
            );
          })}
        </section>
        <aside className="overview-side">
          <section className="panel stage-panel"><div className="panel-head"><h2>阶段签字</h2><PeopleRegular /></div>{state.signatures.map((item) => <div className="signature-row" key={item.stage}><span className={item.status === '已签署' ? 'signed' : item.status === '已失效' ? 'invalid' : ''}>{item.status === '已签署' ? <CheckmarkCircleRegular /> : item.status === '已失效' ? <WarningRegular /> : item.stage.slice(0, 1)}</span><div><strong>{item.stage}签署</strong><small>{item.actor} · {item.time}{item.status === '已失效' ? ' · 已随压力链失效，待重签' : ''}</small></div></div>)}</section>
          <section className="panel dependency-panel"><div className="panel-head"><h2>依赖路径</h2><GaugeRegular /></div><div className="dependency-graph"><span>CARD-01</span><i /><span>CARD-02</span><i /><span className="critical">CARD-03 压力链</span><i /><span>CARD-07</span><i /><span>CARD-08 放行基线</span></div></section>
        </aside>
      </div>
    </div>
  );
}

function Execution() {
  const state = useSelector((root: RootState) => root.maintenance);
  const dispatch = useDispatch();
  const { data } = useGetWorkPackageQuery();
  const card = state.cards.find((item) => item.id === state.activeCardId) ?? state.cards[0];
  const [measurement, setMeasurement] = useState(card.measurement);
  const [finding, setFinding] = useState(card.finding);
  const [consumable, setConsumable] = useState('');
  const [witness, setWitness] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [gaugeId, setGaugeId] = useState('');
  const [reading, setReading] = useState('');
  const [actor, setActor] = useState(state.inspectors[0].split(' · ')[0]);
  const [retest, setRetest] = useState<RetestTarget | null>(null);
  const [submitCard] = useSubmitCardMutation();
  const chain = state.chains.find((c) => c.cardId === card.id);
  useEffect(() => { setMeasurement(card.measurement); setFinding(card.finding); setReading(chain?.status === '已失效' ? chain.retainedReading : chain?.reading ?? ''); setGaugeId(''); }, [card.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const toleranceIssue = card.pressure ? Number.parseFloat(measurement) < (card.requiredMinPsi ?? Number.POSITIVE_INFINITY) : card.id === 'CARD-03' && Number.parseFloat(measurement) < 2850;
  const dependenciesMet = card.dependencies.every((dependency) => state.cards.find((item) => item.id === dependency)?.status === '已完成');
  const selectedGauge = state.gauges.find((g) => g.id === gaugeId);

  const submitPressure = (kind: '测量' | '复测') => {
    if (!gaugeId || !selectedGauge) { dispatch(setConflict('请先选择一只校准有效、量程覆盖的压力表。')); return; }
    dispatch(recordPressureAction({ cardId: card.id, gaugeId, reading: reading || measurement, actor, kind }));
    if (!store.getState().maintenance.conflictMessage && kind === '复测') {
      setRetest({ cardId: card.id, gaugeId, reading: reading || measurement, actor, mode: 'confirm' });
    }
  };

  const complete = async () => {
    if (!dependenciesMet) { dispatch(setConflict(`前置工卡 ${card.dependencies.join('、')} 尚未完成。`)); return; }
    if (card.pressure) {
      if (!chain) { dispatch(setConflict('压力工卡必须先占用一只有效压力表并登记压力测量，形成测量链。')); return; }
      if (chain.status === '已失效') { dispatch(setConflict('压力测量链已失效，旧读数保留但不得放行：请用合格表复测并经质量授权确认。')); return; }
      if (chain.status === '待复测确认') { dispatch(setConflict('复测结果尚未经质量授权人确认。')); return; }
      if (measurement !== chain.reading) { dispatch(setConflict(`现场读数 ${measurement || '(空)'} 与压力链登记读数 ${chain.reading} 不一致，请重新占用登记。`)); return; }
    }
    if (toleranceIssue && card.status !== '执行中') {
      dispatch(setConflict('测量值超出容差，必须由授权人员处理。'));
      return;
    }
    if (!witness) { dispatch(setConflict('关键步骤必须完成见证确认。')); return; }
    if (state.syncVersion !== state.serverVersion) { dispatch(setConflict('检测到冲突提交：本地版本与服务器版本不一致，请刷新后重试。')); return; }
    const result = await submitCard({ cardId: card.id, expectedRevision: state.serverVersion, measurement, finding }).unwrap().catch((error) => {
      dispatch(setConflict(error.data?.message ?? '提交失败，请重试。'));
      return null;
    });
    if (result?.accepted) {
      dispatch(updateCard({ measurement, finding, status: '已完成' }));
      if (card.pressure) dispatch(releaseGauge(card.id));
      dispatch(setConflict(''));
    }
  };

  return (
    <div className="page">
      <PageHeading eyebrow={`${card.id} / ${card.stage}`} title={card.title} description={`${card.zone} · 工卡版本 ${card.cardRevision} · 预计 ${card.estimated} 小时`} actions={<><Button appearance="secondary" icon={<ArrowSyncRegular />} onClick={() => dispatch(toggleOffline())}>{state.offline ? '恢复在线' : '离线暂存'}</Button><Button appearance="primary" icon={<CheckmarkCircleRegular />} onClick={complete}>完成并提交</Button></>} />
      <ConflictMessage />
      <div className="execution-grid">
        <section className="panel card-editor">
          <div className="panel-head"><div><h2>工卡执行内容</h2><span>{card.pressure ? '压力工卡：测量值必须来自占用的校准合格压力表' : '执行人员必须记录关键数据及证据'}</span></div><div className="head-badges">{card.pressure && <Button size="small" appearance="subtle" onClick={() => dispatch(bumpCardRevision(card.id))}>工卡版本升级（{card.cardRevision}）</Button>}<Badge appearance="tint" color={card.status === '待授权' || card.status === '待复测' ? 'danger' : 'brand'}>{card.status}</Badge></div></div>
          {card.pressure && (
            <div className="pressure-chain-block">
              <div className="chain-bar">
                <span>压力表</span><i /><span>压力测量</span><i /><span>校准证 / 量程快照</span><i /><span>{card.stage.slice(0, 2)}签字</span><i /><span className={chain && chain.status === '有效' ? 'ok' : 'bad'}>放行基线</span>
              </div>
              {chain ? (
                <div className={`chain-status ${chain.status === '有效' ? 'valid' : ''}`}>
                  <div><strong>当前测量链</strong><small>{chain.gaugeId} · {chain.certNo} · 量程快照 0–{chain.rangeMaxAtRead} psi · 工卡 {chain.cardRevision} · {chain.measuredBy} {chain.measuredAt}</small></div>
                  <Badge appearance="tint" color={chainColor(chain.status)}>{chain.status === '有效' ? '链有效，可放行' : chain.status}</Badge>
                  {chain.status !== '有效' && <p className="chain-invalid">{chain.status === '待复测确认' ? '复测读数待质量授权人确认。' : `失效原因：${chain.invalidReason}（${chain.invalidatedAt}）；原值保留：${chain.retainedReading}，须复测。`}</p>}
                  {chain.status === '待复测确认' && <Button size="small" appearance="primary" onClick={() => setRetest({ cardId: card.id, gaugeId: chain.gaugeId, reading: chain.reading, actor: chain.measuredBy, mode: 'confirm' })}>质量授权确认</Button>}
                </div>
              ) : <p className="chain-hint">尚未占用压力表：每只机库共用表同一时刻只能由一张工卡占用，两名检验员同时提交时先到者占用。</p>}
              <div className="gauge-form">
                <Field label="占用压力表" hint="到期/撤证/量程不足的表不可选">
                  <select className="native-select" value={gaugeId} onChange={(e) => setGaugeId(e.target.value)}>
                    <option value="">— 选择共用压力表 —</option>
                    {state.gauges.map((g) => {
                      const taken = g.occupiedByCard && g.occupiedByCard !== card.id;
                      const rangeOk = card.requiredMinPsi === null || g.rangeMaxPsi >= card.requiredMinPsi;
                      return <option key={g.id} value={g.id} disabled={g.calibStatus !== '有效' || !rangeOk || Boolean(taken)}>{g.id} · {g.calibStatus} · 0–{g.rangeMaxPsi} psi{g.calibStatus !== '有效' ? `（${g.calibStatus}）` : ''}{!rangeOk ? '（量程不足）' : ''}{taken ? `（${g.occupiedByCard} 占用中）` : ''}</option>;
                    })}
                  </select>
                </Field>
                <Field label="现场压力读数 (psi)" validationState={selectedGauge && Number.parseFloat(reading) > selectedGauge.rangeMaxPsi ? 'error' : 'none'} validationMessage={selectedGauge && Number.parseFloat(reading) > selectedGauge.rangeMaxPsi ? `超过量程 ${selectedGauge.rangeMaxPsi} psi` : undefined}><Input value={reading} onChange={(_, d) => setReading(d.value)} contentBefore={<GaugeRegular />} placeholder="如 2876" /></Field>
                <Field label="提交检验员"><select className="native-select" value={actor} onChange={(e) => setActor(e.target.value)}>{state.inspectors.map((name) => <option key={name}>{name.split(' · ')[0]}</option>)}</select></Field>
                <div className="gauge-actions">
                  {chain?.status === '已失效'
                    ? <Button appearance="primary" onClick={() => submitPressure('复测')}>占用并提交复测</Button>
                    : <Button appearance="primary" onClick={() => submitPressure('测量')}>占用压力表并记录</Button>}
                  <small>{state.failWrites ? '当前写入会失败：占用与现场读数保留，可按原请求恢复' : '占用与读数登记原子提交'}</small>
                </div>
              </div>
            </div>
          )}
          <Divider />
          <div className="procedure-block">
            <h3>施工步骤</h3>
            {['确认飞机断电并设置 DO NOT OPERATE 警告牌。', '连接校准合格的测试设备，按 AMM 29-10-00 执行压力保持测试。', '记录稳定压力值，检查 10 分钟内压降。', '恢复系统构型，目视检查渗漏并上传证据。'].map((step, index) => <label key={step} className="procedure-step"><Checkbox defaultChecked={index < 2} /><span><b>{index + 1}.</b> {step}</span></label>)}
          </div>
          <Divider />
          <div className="form-grid">
            <Field label={card.pressure ? '测量值（来自压力链）' : '测量值'} hint={card.tolerance} validationState={toleranceIssue ? 'error' : 'none'} validationMessage={toleranceIssue ? `低于最低接受值 ${card.requiredMinPsi ?? 2850} psi` : undefined}><Input value={measurement} onChange={(_, d) => setMeasurement(d.value)} contentBefore={<GaugeRegular />} /></Field>
            <Field label="耗材 / 航材"><Input value={consumable} onChange={(_, d) => setConsumable(d.value)} placeholder="输入件号或耗材批次" /></Field>
            <Field label="发现与处置" className="wide-field"><Textarea value={finding} onChange={(_, d) => setFinding(d.value)} resize="vertical" placeholder="正常或填写缺陷、处置措施" /></Field>
            <Field label="证据附件" className="wide-field"><div className="upload-zone"><CloudArrowUpRegular /><strong>拖入照片、测试记录或报告</strong><span>已关联 3 个证据 · 支持 JPG / PDF / TXT</span></div></Field>
          </div>
          <label className="witness-check"><Checkbox checked={witness} onChange={(_, d) => setWitness(Boolean(d.checked))} /><span><strong>见证人已现场确认</strong><small>要求：{card.witness}</small></span></label>
        </section>
        <aside className="execution-side">
          <section className="panel card-meta"><div className="panel-head"><h2>工卡信息</h2><DocumentBulletListRegular /></div><dl><div><dt>工卡版本</dt><dd>{card.cardRevision}{card.pressure ? ' · 版本变更将使测量链失效' : ''}</dd></div><div><dt>容差</dt><dd>{card.tolerance}</dd></div><div><dt>证据要求</dt><dd>{card.evidence}</dd></div><div><dt>前置条件</dt><dd>{card.dependencies.length ? card.dependencies.join('、') : '无'}</dd></div><div><dt>阶段签署</dt><dd>{card.stage}</dd></div></dl></section>
          {card.pressure && chain && (
            <section className="panel chain-history-panel"><div className="panel-head"><h2>测量链原值历史</h2><Badge appearance="tint">{chain.history.length}</Badge></div>
              {chain.history.map((h, i) => <div className="evidence-row" key={`${h.at}-${i}`}><GaugeRegular /><div><strong>{h.reading} · {h.gaugeId}</strong><small>{h.at} · {h.certNo}</small></div></div>)}
              {chain.retainedReading && <div className="retained-note"><WarningRegular /><span>失效后原值只读保留，复测不覆盖。</span></div>}
            </section>
          )}
          {card.status === '待授权' && <section className="panel override-panel"><WarningRegular /><h3>超差项目等待授权</h3><p>原始测量值已保留。授权人员可以批准工程指令、退回复测或要求停场处理。超差授权不替代压力链复测确认。</p><Button appearance="primary" onClick={() => setOverrideOpen(true)}>授权处理</Button></section>}
          <section className="panel evidence-panel"><div className="panel-head"><h2>证据附件</h2><Badge appearance="tint">3 项</Badge></div>{['IMG_20260929_0904.jpg', '液压测试原始记录.pdf', '见证签字单_宋杰.pdf'].map((file, index) => <div className="evidence-row" key={file}><DocumentBulletListRegular /><div><strong>{file}</strong><small>{index + 1}.8 MB · 09:1{index}</small></div><Button size="small" appearance="subtle">预览</Button></div>)}</section>
        </aside>
      </div>
      <Dialog open={overrideOpen} onOpenChange={(_, d) => setOverrideOpen(d.open)}><DialogSurface><DialogBody><DialogTitle>超差授权处理</DialogTitle><DialogContent>批准后将在工卡中记录授权人、工程指令编号与处置依据，原始测量值不会被覆盖。<Field label="工程指令编号" required className="dialog-field"><Input defaultValue="EO-2026-1147" /></Field><Field label="授权依据" required className="dialog-field"><Textarea defaultValue="按 AMM 容差分析并经工程部门确认，允许执行复测与系统恢复。" /></Field></DialogContent><DialogActions><Button appearance="secondary" onClick={() => setOverrideOpen(false)}>取消</Button><Button appearance="primary" onClick={() => { dispatch(authorizeOverride()); setOverrideOpen(false); }}>确认授权</Button></DialogActions></DialogBody></DialogSurface></Dialog>
      <RetestDialog target={retest} onClose={() => setRetest(null)} />
    </div>
  );
}

function Gauges() {
  const state = useSelector((root: RootState) => root.maintenance);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [rangeTarget, setRangeTarget] = useState<string | null>(null);
  const [rangeValue, setRangeValue] = useState('4000');
  const [simGauge, setSimGauge] = useState('PG-102');
  const [simCard, setSimCard] = useState('CARD-03');
  const [simActor, setSimActor] = useState(state.inspectors[1]?.split(' · ')[0] ?? '韩磊');
  const [retest, setRetest] = useState<RetestTarget | null>(null);
  const pressureCards = state.cards.filter((c) => c.pressure);
  const openRange = (id: string, current: number) => { setRangeTarget(id); setRangeValue(String(current)); };
  const submitRange = () => {
    const value = Number.parseInt(rangeValue, 10);
    if (Number.isFinite(value) && value > 0 && rangeTarget) dispatch(setGaugeRange({ gaugeId: rangeTarget, rangeMaxPsi: value }));
    setRangeTarget(null);
  };

  return (
    <div className="page">
      <PageHeading eyebrow="SHARED HYDRAULIC GAUGES" title="压力表与校准链" description="机库共用液压压力表台账：每只表同一时刻只能被一张工卡占用；校准状态、量程或工卡版本变更时，关联测量与阶段签字立即级联失效。" actions={<Button appearance={state.failWrites ? 'primary' : 'secondary'} icon={<AlertRegular />} onClick={() => dispatch(toggleFailWrites())}>{state.failWrites ? '关闭写入故障注入' : '演练：注入写入失败'}</Button>} />
      <ConflictMessage />
      <div className="gauges-grid">
        <div className="gauges-main">
          <section className="panel">
            <div className="panel-head"><div><h2>共用压力表台账</h2><span>占用 / 校准证 / 量程</span></div>{state.released && <Badge appearance="tint" color="success">放行基线只读</Badge>}</div>
            <div className="gauge-grid">
              {state.gauges.map((g) => (
                <div className={`gauge-card ${g.calibStatus !== '有效' ? 'invalid' : ''} ${g.occupiedByCard ? 'occupied' : ''}`} key={g.id}>
                  <div className="gauge-card-head"><GaugeRegular /><div><strong>{g.id}</strong><small>{g.name} · {g.serial}</small></div><Badge appearance="tint" color={calibColor(g.calibStatus)}>{g.calibStatus}</Badge></div>
                  <dl>
                    <div><dt>校准证</dt><dd>{g.certNo}</dd></div>
                    <div><dt>有效期至</dt><dd>{g.calibDue}</dd></div>
                    <div><dt>量程</dt><dd>{g.rangeMinPsi}–{g.rangeMaxPsi} psi</dd></div>
                    <div><dt>占用</dt><dd>{g.occupiedByCard ? `${g.occupiedByCard} · ${g.occupiedBy}（${g.occupiedSince}）` : '空闲'}</dd></div>
                  </dl>
                  <div className="gauge-card-actions">
                    {g.calibStatus === '有效' && <Button size="small" appearance="subtle" disabled={state.released} onClick={() => dispatch(setCalibration({ gaugeId: g.id, status: '到期' }))}>标记校准到期</Button>}
                    {g.calibStatus === '有效' && <Button size="small" appearance="subtle" disabled={state.released} onClick={() => dispatch(setCalibration({ gaugeId: g.id, status: '撤证' }))}>撤销校准证</Button>}
                    {g.calibStatus !== '有效' && <Button size="small" appearance="subtle" disabled={state.released} onClick={() => dispatch(setCalibration({ gaugeId: g.id, status: '有效', due: '2027-09-30' }))}>复检恢复有效</Button>}
                    <Button size="small" appearance="subtle" disabled={state.released} onClick={() => openRange(g.id, g.rangeMaxPsi)}>变更量程</Button>
                  </div>
                </div>
              ))}
            </div>
            <p className="gauges-note"><WarningRegular /> 校准证到期/撤证：在用测量链与关联阶段签字立即失效并释放占用；量程变更：测量链失效但占用保留待复测；复检恢复有效不会自动救活旧测量，必须复测。</p>
          </section>
          <section className="panel">
            <div className="panel-head"><div><h2>压力测量链台账</h2><span>测量 → 校准证快照 → 阶段签字 → 放行基线</span></div></div>
            {state.chains.map((c) => {
              const card = state.cards.find((card) => card.id === c.cardId);
              return (
                <div className={`chain-ledger-row ${c.status === '有效' ? 'valid' : ''}`} key={c.cardId}>
                  <div className="chain-ledger-main">
                    <strong>{c.cardId} · {card?.title}</strong>
                    <small>{c.gaugeId} · {c.certNo} · 读数 <b>{c.reading}</b> · 工卡 {c.cardRevision} · {c.measuredBy} {c.measuredAt}</small>
                    {c.status !== '有效' && <small className="retained">原值保留：{c.retainedReading} · 失效原因：{c.status === '待复测确认' ? '复测已提交，待QA确认' : c.invalidReason}</small>}
                  </div>
                  <div className="chain-ledger-actions">
                    <Badge appearance="tint" color={chainColor(c.status)}>{c.status}</Badge>
                    {c.status === '待复测确认' && <Button size="small" appearance="primary" onClick={() => setRetest({ cardId: c.cardId, gaugeId: c.gaugeId, reading: c.reading, actor: c.measuredBy, mode: 'confirm' })}>质量授权确认</Button>}
                    {c.status === '已失效' && <Button size="small" appearance="primary" onClick={() => { dispatch(selectCard(c.cardId)); navigate('/execution'); }}>去复测</Button>}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
        <aside className="gauges-side">
          <section className="panel contention-panel">
            <div className="panel-head"><div><h2>同时提交演练</h2><span>两名检验员抢同一只表：先到者占用</span></div></div>
            <div className="contention-form">
              <Field label="压力表"><select className="native-select" value={simGauge} onChange={(e) => setSimGauge(e.target.value)}>{state.gauges.map((g) => <option key={g.id} value={g.id}>{g.id}（{g.calibStatus} 0–{g.rangeMaxPsi}）{g.occupiedByCard ? ` · ${g.occupiedByCard}占用` : ''}</option>)}</select></Field>
              <Field label="先到工卡 / 检验员"><select className="native-select" value={simCard} onChange={(e) => setSimCard(e.target.value)}>{pressureCards.map((c) => <option key={c.id} value={c.id}>{c.id} · 宋杰</option>)}</select></Field>
              <Field label="后到检验员（并发）"><select className="native-select" value={simActor} onChange={(e) => setSimActor(e.target.value)}>{state.inspectors.map((n) => <option key={n}>{n.split(' · ')[0]}</option>)}</select></Field>
              <Button appearance="primary" disabled={state.released} onClick={() => dispatch(contendGauge({ gaugeId: simGauge, firstCard: simCard, secondActor: simActor }))}>两人同时提交</Button>
            </div>
            <div className="contention-log">
              {state.contention.map((log, i) => <div className="contention-row" key={`${log.time}-${i}`}><span className="timeline-dot" /><div><strong>{log.winner} 胜出</strong><p>{log.loser} 被拒绝 · {log.result}</p><small>{log.time} · {log.gaugeId}</small></div></div>)}
            </div>
          </section>
        </aside>
      </div>
      <Dialog open={rangeTarget !== null} onOpenChange={(_, d) => d.open === false && setRangeTarget(null)}><DialogSurface><DialogBody><DialogTitle>变更压力表量程 · {rangeTarget}</DialogTitle><DialogContent>量程一变，所有关联在用测量链与阶段签字立即失效，原值保留待复测；占用保留。<Field label="新量程上限 (psi)" className="dialog-field" required><Input value={rangeValue} onChange={(_, d) => setRangeValue(d.value)} /></Field></DialogContent><DialogActions><Button appearance="secondary" onClick={() => setRangeTarget(null)}>取消</Button><Button appearance="primary" onClick={submitRange}>确认变更并级联失效</Button></DialogActions></DialogBody></DialogSurface></Dialog>
      <RetestDialog target={retest} onClose={() => setRetest(null)} />
    </div>
  );
}

function Release() {
  const state = useSelector((root: RootState) => root.maintenance);
  const dispatch = useDispatch();
  const [tab, setTab] = useState('open');
  const blockers = state.cards.filter((card) => card.status !== '已完成' && card.status !== '未开始');
  const allSigned = state.signatures.every((item) => item.status === '已签署');
  const gate = useMemo(() => evaluateRelease(state), [state]);
  const gateChecks = [
    { label: '无已失效压力测量链（校准/量程/版本变更后已复测）', ok: !state.chains.some((c) => c.status === '已失效') },
    { label: '复测结果均已经质量授权人确认', ok: !state.chains.some((c) => c.status === '待复测确认') },
    { label: '无失败未恢复的压力写入', ok: state.pendingWrites.length === 0 },
    { label: '无待授权超差 / 待复测工卡', ok: !state.cards.some((c) => c.status === '待授权' || c.status === '待复测') },
    { label: '关键工卡完成率 ≥ 75%', ok: state.cards.filter((card) => card.status === '已完成').length >= 6 },
    { label: '四个阶段签字均有效', ok: allSigned }
  ];
  return (
    <div className="page">
      <PageHeading eyebrow="RELEASE REVIEW / B-7891" title="放行审阅" description="核对压力链完整性、未关闭项目、关键证据与阶段签字；锁定后形成只读放行基线。" actions={<Button appearance="primary" icon={<LockClosedRegular />} disabled={!gate.ok || state.released} onClick={() => dispatch(releasePackage())}>{state.released ? '工作包已锁定' : '锁定并放行'}</Button>} />
      <ConflictMessage />
      {state.released && <MessageBar intent="success" className="top-message"><MessageBarBody>工作包已锁定，压力测量、校准证快照与阶段签字冻结为只读放行基线（校验值 {state.baseline?.checksum}）。</MessageBarBody></MessageBar>}
      {!gate.ok && <MessageBar intent="error" className="top-message"><MessageBarBody><strong>放行门禁未通过：</strong>{gate.reasons.join('；')}。</MessageBarBody></MessageBar>}
      <div className="release-grid">
        <section className="panel release-main">
          <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(String(d.value))}><Tab value="open">未关闭项目 <Badge>{blockers.length}</Badge></Tab><Tab value="chains">压力链 <Badge>{state.chains.length}</Badge></Tab><Tab value="repeat">重复缺陷 <Badge>2</Badge></Tab><Tab value="evidence">关键证据 <Badge>12</Badge></Tab></TabList>
          <div className="tab-body">
            {tab === 'open' && blockers.map((card) => <div className="review-item" key={card.id}><span className={`risk-icon ${card.status === '待授权' || card.status === '待复测' ? 'danger' : ''}`}><AlertRegular /></span><div><strong>{card.id} · {card.title}</strong><p>{card.finding || '工卡正在执行，完成后需由放行人员复核。'}</p><small>{card.zone} · 要求证据 {card.evidence}</small></div><Badge appearance="tint" color={card.status === '待授权' || card.status === '待复测' ? 'danger' : 'warning'}>{card.status}</Badge></div>)}
            {tab === 'chains' && state.chains.map((chain) => {
              const card = state.cards.find((c) => c.id === chain.cardId);
              return <div className="review-item" key={chain.cardId}><span className={`risk-icon ${chain.status === '有效' ? '' : 'danger'}`}><GaugeRegular /></span><div><strong>{chain.cardId} · {card?.title}</strong><p>{chain.gaugeId} · {chain.certNo} · 读数 {chain.reading} · 工卡 {chain.cardRevision}{chain.status !== '有效' ? ` · ${chain.invalidReason || '待QA确认'}，原值 ${chain.retainedReading} 保留` : ` · QA：${chain.qaConfirmedBy || '初测有效'}`}</p><small>测量 {chain.measuredBy} {chain.measuredAt}</small></div><Badge appearance="tint" color={chainColor(chain.status)}>{chain.status}</Badge></div>;
            })}
            {tab === 'repeat' && <><div className="review-item"><span className="risk-icon danger"><HistoryRegular /></span><div><strong>液压系统压力偏低 · 第 3 次记录</strong><p>2026-08-16、09-02、09-29 均在系统 A 出现压力低于目标值。</p><small>建议移交可靠性分析，并关联历史排故记录。</small></div><Badge appearance="tint" color="danger">关键</Badge></div><div className="review-item"><span className="risk-icon"><HistoryRegular /></span><div><strong>APU 启动时间延长</strong><p>最近两次航线记录均略高于机队均值。</p><small>非放行阻塞项，建议后续监控。</small></div><Badge appearance="tint" color="warning">观察</Badge></div></>}
            {tab === 'evidence' && <div className="evidence-grid">{['液压系统测试记录.pdf', '压力表校准证_CAL-2026-4107.pdf', '发动机孔探照片_01.jpg', 'AD 执行签署页.pdf', '复测QA确认单.pdf', '见证人签字单.pdf'].map((file) => <div className="evidence-tile" key={file}><DocumentBulletListRegular /><strong>{file}</strong><span>已绑定工卡 · 已核验</span></div>)}</div>}
          </div>
          {state.baseline && (
            <div className="baseline-panel">
              <div className="panel-head"><div><h2>放行基线快照（只读）</h2><span>{state.baseline.frozenAt} · {state.baseline.frozenBy} · R{state.baseline.serverRevision} · checksum {state.baseline.checksum}</span></div><LockClosedRegular /></div>
              <div className="baseline-chains">{state.baseline.chainSnapshot.map((c) => <div key={c.cardId}><strong>{c.cardId}</strong><span>{c.gaugeId} · {c.certNo}</span><b>{c.reading}</b><Tag size="extra-small" color="success">{c.status}</Tag></div>)}</div>
              <div className="baseline-sigs">{state.baseline.signatureSnapshot.map((s) => <span key={s.stage}>{s.stage}：{s.actor} {s.time}</span>)}</div>
            </div>
          )}
        </section>
        <aside className="release-side">
          <section className="panel signoff-card"><div className="panel-head"><h2>分阶段签字</h2><span>{state.signatures.filter((item) => item.status === '已签署').length} / 4 有效</span></div>{state.signatures.map((item) => <div className="signoff-row" key={item.stage}><div><span>{item.stage}</span><strong>{item.actor}</strong><small>{item.time}</small></div>{item.status === '已签署' ? <Badge appearance="tint" color="success">已签署</Badge> : item.status === '已失效' ? <Button size="small" appearance="primary" onClick={() => dispatch(signStage(item.stage))}>复测后重签</Button> : <Button size="small" appearance="primary" onClick={() => dispatch(signStage(item.stage))}>签署</Button>}</div>)}</section>
          <section className="panel release-gate-card"><LockClosedRegular /><h3>放行门禁</h3>{gateChecks.map((check) => <label key={check.label}><Checkbox checked={check.ok} readOnly /> {check.label}</label>)}</section>
        </aside>
      </div>
    </div>
  );
}

function Audit() {
  const state = useSelector((root: RootState) => root.maintenance);
  const [selected, setSelected] = useState('R7');
  const downloadAudit = () => {
    const csv = ['时间,操作者,动作,说明', ...state.audit.map((item) => [item.time, item.actor, item.action, item.detail].join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'B7891-48A-audit.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const diffs = useMemo(() => [
    { card: 'CARD-03', field: '容差', from: '≥ 2800 psi / 10 min', to: '≥ 2850 psi / 10 min', reason: 'AMM 临时修订 TR-114：关联测量链立即失效待复测' },
    { card: 'CARD-07', field: '依赖', from: 'CARD-02', to: 'CARD-03', reason: '试车前置条件调整' },
    { card: 'CARD-08', field: '证据', from: '近 2 次记录', to: '近 3 次记录', reason: '可靠性复核要求' }
  ], []);
  return (
    <div className="page">
      <PageHeading eyebrow="AUDIT / VERSION CONTROL" title="审计与版本差异" description="对比工卡版本、查看压力链级联事件与操作历史并导出闭环证据。" actions={<Button appearance="primary" icon={<ArrowDownloadRegular />} onClick={downloadAudit}>导出审计记录</Button>} />
      <div className="audit-grid">
        <section className="panel diff-panel"><div className="panel-head"><div><h2>工卡版本差异</h2><span>R6 → R7 · 3 处变更</span></div><select value={selected} onChange={(event) => setSelected(event.target.value)}><option>R7</option><option>R6</option><option>R5</option></select></div><div className="diff-table"><div className="diff-head"><span>工卡</span><span>字段</span><span>原值</span><span>新值 / 原因</span></div>{diffs.map((diff) => <div className="diff-row" key={`${diff.card}-${diff.field}`}><strong>{diff.card}</strong><span>{diff.field}</span><del>{diff.from}</del><div><ins>{diff.to}</ins><small>{diff.reason}</small></div></div>)}</div></section>
        <section className="panel audit-panel"><div className="panel-head"><div><h2>完整审计时间线</h2><span>{state.audit.length} 条记录</span></div><HistoryRegular /></div>{state.audit.map((item, index) => <div className="audit-row" key={`${item.time}-${index}`}><span className="timeline-dot" /><div><strong>{item.action}</strong><p>{item.detail}</p><small>{item.time} · {item.actor}</small></div></div>)}</section>
      </div>
    </div>
  );
}

function NotFound() {
  return <Navigate to="/" replace />;
}

export default function App() {
  return (
    <FluentProvider theme={webLightTheme}>
      <BrowserRouter>
        <Shell><Routes><Route path="/" element={<Overview />} /><Route path="/execution" element={<Execution />} /><Route path="/gauges" element={<Gauges />} /><Route path="/release" element={<Release />} /><Route path="/audit" element={<Audit />} /><Route path="*" element={<NotFound />} /></Routes></Shell>
      </BrowserRouter>
    </FluentProvider>
  );
}
