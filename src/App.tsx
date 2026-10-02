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
  Text,
  Textarea,
  Tooltip,
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
  changeGaugeCertStatus,
  changeGaugeRange,
  claimGauge,
  confirmRetest,
  refreshVersion,
  releaseGauge,
  releasePackage,
  retestMeasurement,
  selectCard,
  setConflict,
  signStage,
  submitMeasurement,
  toggleOffline,
  updateCard,
  type RootState
} from './store';

type NavItem = { path: string; label: string; icon: ReactNode };

function Shell({ children }: { children: ReactNode }) {
  const state = useSelector((root: RootState) => root.maintenance);
  const dispatch = useDispatch();
  const nav: NavItem[] = [
    { path: '/', label: '工作包总览', icon: <ClipboardTaskListLtrRegular /> },
    { path: '/execution', label: '工卡执行', icon: <BookOpenRegular /> },
    { path: '/gauges', label: '压力表台账', icon: <GaugeRegular /> },
    { path: '/release', label: '放行审阅', icon: <LockClosedRegular /> },
    { path: '/audit', label: '审计与差异', icon: <HistoryRegular /> }
  ];
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon"><NavigationRegular /></div>
          <div><strong>航空定检执行台</strong><span>Maintenance Work Package</span></div>
        </div>
        <div className="aircraft-chip"><span>B-7891</span><strong>B737-800</strong><Badge appearance="tint" color="brand">48A 定检</Badge></div>
        <div className="header-spacer" />
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
          <div className="side-status"><WarningRegular /><div><strong>{state.cards.filter((card) => card.status === '待授权').length} 项待授权</strong><span>放行前必须处理</span></div></div>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><small>{eyebrow}</small><h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{actions}</div></div>;
}

function Overview() {
  const state = useSelector((root: RootState) => root.maintenance);
  const { data } = useGetWorkPackageQuery();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const completed = state.cards.filter((card) => card.status === '已完成').length;
  const blockers = state.cards.filter((card) => card.status === '待授权');
  return (
    <div className="page">
      <PageHeading eyebrow="WP-B7891-04 / 48A CHECK" title="工作包总览" description="监控工卡依赖、阶段签署、超差项目和放行门禁。" actions={<><Button appearance="secondary" icon={<ArrowDownloadRegular />}>导出进度</Button><Button appearance="primary" icon={<NavigationRegular />} onClick={() => navigate('/execution')}>继续执行</Button></>} />
      {blockers.length > 0 && <MessageBar intent="warning" className="top-message"><MessageBarBody><strong>放行阻断：</strong>{blockers.map((card) => `${card.id} ${card.title}`).join('、')} 等待授权人员处理。</MessageBarBody></MessageBar>}
      <div className="metrics-grid">
        {[
          ['工卡完成度', `${completed} / ${state.cards.length}`, `${Math.round(completed / state.cards.length * 100)}%`, 'green'],
          ['已记录工时', '18.6 h', '计划 20.5 h', 'blue'],
          ['开放发现', String(state.cards.filter((card) => card.finding && card.status !== '已完成').length), '1 项重复缺陷', 'amber'],
          ['待签署阶段', String(state.signatures.filter((item) => item.status === '待签署').length), '放行前完成', 'red']
        ].map((item) => <div className="metric-card" key={item[0]}><span>{item[0]}</span><strong>{item[1]}</strong><small className={item[3]}>{item[2]}</small></div>)}
      </div>
      <div className="overview-grid">
        <section className="panel task-panel">
          <div className="panel-head"><div><h2>关键工卡与依赖</h2><span>按执行依赖和风险排序</span></div><Badge appearance="tint">{data?.revision ?? 'WP R7'}</Badge></div>
          {state.cards.map((card, index) => (
            <button key={card.id} className={`task-row ${state.activeCardId === card.id ? 'active' : ''}`} onClick={() => { dispatch(selectCard(card.id)); navigate('/execution'); }}>
              <span className={`task-index ${card.status === '已完成' ? 'done' : card.status === '待授权' ? 'blocked' : ''}`}>{card.status === '已完成' ? <CheckmarkCircleRegular /> : index + 1}</span>
              <span className="task-main"><strong>{card.id} · {card.title}</strong><small>{card.zone} · 依赖 {card.dependencies.length ? card.dependencies.join('、') : '无'} · 计划 {card.estimated}h</small></span>
              <Tag appearance="outline" size="small">{card.stage}</Tag>
              <Badge appearance="tint" color={card.status === '已完成' ? 'success' : card.status === '待授权' ? 'danger' : card.status === '执行中' ? 'brand' : 'informative'}>{card.status}</Badge>
            </button>
          ))}
        </section>
        <aside className="overview-side">
          <section className="panel stage-panel"><div className="panel-head"><h2>阶段签字</h2><PeopleRegular /></div>{state.signatures.map((item) => <div className="signature-row" key={item.stage}><span className={item.status === '已签署' ? 'signed' : ''}>{item.status === '已签署' ? <CheckmarkCircleRegular /> : item.stage.slice(0, 1)}</span><div><strong>{item.stage}签署</strong><small>{item.actor} · {item.time}</small></div></div>)}</section>
          <section className="panel dependency-panel"><div className="panel-head"><h2>依赖路径</h2><GaugeRegular /></div><div className="dependency-graph"><span>CARD-01</span><i /><span>CARD-02</span><i /><span className="critical">CARD-03</span><i /><span>CARD-07</span><i /><span>CARD-08</span></div></section>
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
  const [simulateFail, setSimulateFail] = useState(false);
  const [retestFor, setRetestFor] = useState<string | null>(null);
  const [retestStep, setRetestStep] = useState<'confirm' | 'execute'>('confirm');
  const [retestAuthority, setRetestAuthority] = useState('');
  const [retestGaugeId, setRetestGaugeId] = useState('');
  const [retestValue, setRetestValue] = useState('');
  const [submitCard] = useSubmitCardMutation();
  useEffect(() => { setMeasurement(card.measurement); setFinding(card.finding); }, [card.id, card.measurement, card.finding]);
  const toleranceIssue = card.id === 'CARD-03' && Number.parseFloat(measurement) < 2850;
  const dependenciesMet = card.dependencies.every((dependency) => state.cards.find((item) => item.id === dependency)?.status === '已完成');
  const isPressureCard = card.id === 'CARD-03';
  const cardGauge = state.gauges.find((item) => item.occupiedBy === card.id);
  const latestMeasurement = state.measurements.find((item) => item.cardId === card.id);
  const idempotencyKey = `idem-${card.id}`;
  const availableGauges = state.gauges.filter((item) => item.certStatus === '有效' && (!item.occupiedBy || item.occupiedBy === card.id));
  const complete = async () => {
    if (!dependenciesMet) {
      dispatch(setConflict(`前置工卡 ${card.dependencies.join('、')} 尚未完成。`));
      return;
    }
    if (toleranceIssue) {
      dispatch(setConflict('测量值超出容差，必须由授权人员处理。'));
      return;
    }
    if (!witness) {
      dispatch(setConflict('关键步骤必须完成见证确认。'));
      return;
    }
    if (state.syncVersion !== state.serverVersion) {
      dispatch(setConflict('检测到冲突提交：本地版本与服务器版本不一致，请刷新后重试。'));
      return;
    }
    if (isPressureCard && !state.measurements.some((item) => item.cardId === card.id && item.status === '有效')) {
      dispatch(setConflict('压力测试必须先占用有效压力表并提交测量，建立有效测量链。'));
      return;
    }
    const result = await submitCard({ cardId: card.id, expectedRevision: state.serverVersion, measurement, finding }).unwrap().catch((error) => {
      dispatch(setConflict(error.data?.message ?? '提交失败，请重试。'));
      return null;
    });
    if (result?.accepted) {
      dispatch(updateCard({ measurement, finding, status: '已完成' }));
      dispatch(setConflict(''));
    }
  };
  const submitGaugeMeasurement = () => {
    if (!cardGauge) {
      dispatch(setConflict('请先占用一只有效压力表。'));
      return;
    }
    dispatch(submitMeasurement({ cardId: card.id, gaugeId: cardGauge.id, value: measurement, inspector: '宋杰', idempotencyKey, simulateFail }));
  };
  const openRetest = (recordId: string) => {
    setRetestFor(recordId);
    setRetestStep('confirm');
    setRetestAuthority('');
    setRetestGaugeId('');
    setRetestValue('');
  };
  const confirmRetestDialog = () => {
    if (!retestFor) return;
    if (retestStep === 'confirm') {
      if (!retestAuthority.trim()) { dispatch(setConflict('复测必须由质量授权人确认。')); return; }
      dispatch(confirmRetest({ measurementId: retestFor, authorizedBy: retestAuthority }));
      setRetestStep('execute');
      return;
    }
    if (!retestGaugeId) { dispatch(setConflict('请选择复测占用的有效压力表。')); return; }
    dispatch(retestMeasurement({ measurementId: retestFor, gaugeId: retestGaugeId, value: retestValue || measurement, inspector: '宋杰' }));
    setRetestFor(null);
  };
  return (
    <div className="page">
      <PageHeading eyebrow={`${card.id} / ${card.stage}`} title={card.title} description={`${card.zone} · 工卡版本 ${data?.revision ?? 'R7'} · 预计 ${card.estimated} 小时`} actions={<><Button appearance="secondary" icon={<ArrowSyncRegular />} onClick={() => dispatch(toggleOffline())}>{state.offline ? '恢复在线' : '离线暂存'}</Button><Button appearance="primary" icon={<CheckmarkCircleRegular />} onClick={complete}>完成并提交</Button></>} />
      {state.conflictMessage && <MessageBar intent="error" className="top-message"><MessageBarBody><strong>提交被阻断：</strong>{state.conflictMessage}</MessageBarBody><Button appearance="secondary" size="small" onClick={() => dispatch(refreshVersion())}>刷新版本</Button></MessageBar>}
      <div className="execution-grid">
        <section className="panel card-editor">
          <div className="panel-head"><div><h2>工卡执行内容</h2><span>执行人员必须记录关键数据及证据</span></div><Badge appearance="tint" color={card.status === '待授权' ? 'danger' : 'brand'}>{card.status}</Badge></div>
          <div className="procedure-block">
            <h3>施工步骤</h3>
            {['确认飞机断电并设置 DO NOT OPERATE 警告牌。', '连接校准合格的测试设备，按 AMM 29-10-00 执行压力保持测试。', '记录稳定压力值，检查 10 分钟内压降。', '恢复系统构型，目视检查渗漏并上传证据。'].map((step, index) => <label key={step} className="procedure-step"><Checkbox defaultChecked={index < 2} /><span><b>{index + 1}.</b> {step}</span></label>)}
          </div>
          <Divider />
          <div className="form-grid">
            <Field label="测量值" hint={card.tolerance} validationState={toleranceIssue ? 'error' : 'none'} validationMessage={toleranceIssue ? '低于最低接受值 2850 psi' : undefined}><Input value={measurement} onChange={(_, data) => setMeasurement(data.value)} contentBefore={<GaugeRegular />} /></Field>
            <Field label="耗材 / 航材"><Input value={consumable} onChange={(_, data) => setConsumable(data.value)} placeholder="输入件号或耗材批次" /></Field>
            <Field label="发现与处置" className="wide-field"><Textarea value={finding} onChange={(_, data) => setFinding(data.value)} resize="vertical" placeholder="正常或填写缺陷、处置措施" /></Field>
            <Field label="证据附件" className="wide-field"><div className="upload-zone"><CloudArrowUpRegular /><strong>拖入照片、测试记录或报告</strong><span>已关联 3 个证据 · 支持 JPG / PDF / TXT</span></div></Field>
          </div>
          <label className="witness-check"><Checkbox checked={witness} onChange={(_, data) => setWitness(Boolean(data.checked))} /><span><strong>见证人已现场确认</strong><small>要求：{card.witness}</small></span></label>
        </section>
        <aside className="execution-side">
          <section className="panel card-meta"><div className="panel-head"><h2>工卡信息</h2><DocumentBulletListRegular /></div><dl><div><dt>容差</dt><dd>{card.tolerance}</dd></div><div><dt>证据要求</dt><dd>{card.evidence}</dd></div><div><dt>前置条件</dt><dd>{card.dependencies.length ? card.dependencies.join('、') : '无'}</dd></div><div><dt>阶段签署</dt><dd>{card.stage}</dd></div></dl></section>
          {card.status === '待授权' && <section className="panel override-panel"><WarningRegular /><h3>超差项目等待授权</h3><p>原始测量值已保留。授权人员可以批准工程指令、退回复测或要求停场处理。</p><Button appearance="primary" onClick={() => setOverrideOpen(true)}>授权处理</Button></section>}
          <section className="panel evidence-panel"><div className="panel-head"><h2>证据附件</h2><Badge appearance="tint">3 项</Badge></div>{['IMG_20260929_0904.jpg', '液压测试原始记录.pdf', '见证签字单_宋杰.pdf'].map((file, index) => <div className="evidence-row" key={file}><DocumentBulletListRegular /><div><strong>{file}</strong><small>{index + 1}.8 MB · 09:1{index}</small></div><Button size="small" appearance="subtle">预览</Button></div>)}</section>
        </aside>
      </div>
      {isPressureCard && (
        <section className="panel gauge-chain-panel">
          <div className="panel-head"><div><h2>压力表占用与测量链</h2><span>每张工卡占用一只有效压力表 · 先到者占用 · 原值保留待复测</span></div><Badge appearance="tint" color={latestMeasurement?.status === '有效' ? 'success' : latestMeasurement?.status === '失效' ? 'danger' : 'warning'}>{latestMeasurement ? `链状态：${latestMeasurement.status}` : '未建链'}</Badge></div>
          <div className="gauge-chain-grid">
            <div className="gauge-occupy">
              <h3>1 · 占用压力表</h3>
              <Field label="选择有效压力表">
                <select value={gaugeId} onChange={(event) => setGaugeId(event.target.value)}>
                  <option value="">{cardGauge ? `${cardGauge.id} 已占用` : '请选择压力表'}</option>
                  {state.gauges.map((gauge) => <option key={gauge.id} value={gauge.id} disabled={gauge.certStatus !== '有效' || (Boolean(gauge.occupiedBy) && gauge.occupiedBy !== card.id)}>{gauge.id} {gauge.name} · {gauge.range} · 证{gauge.certStatus}{gauge.occupiedBy ? `（${gauge.occupiedBy} 占用中）` : ''}</option>)}
                </select>
              </Field>
              <div className="gauge-occupy-actions">
                <Button appearance="primary" icon={<GaugeRegular />} onClick={() => { if (gaugeId) dispatch(claimGauge({ cardId: card.id, gaugeId })); }} disabled={!gaugeId}>占用</Button>
                <Button appearance="secondary" onClick={() => dispatch(releaseGauge({ cardId: card.id }))} disabled={!cardGauge}>释放</Button>
              </div>
              {cardGauge && <div className="gauge-cert-card"><strong>{cardGauge.name}</strong><small>量程 {cardGauge.range}</small><small>校准证 {cardGauge.certNo} · {cardGauge.certStatus} · 至 {cardGauge.certExpiry}</small></div>}
            </div>
            <div className="gauge-submit">
              <h3>2 · 提交压力测量</h3>
              <Field label="现场读数" hint={card.tolerance}><Input value={measurement} onChange={(_, data) => setMeasurement(data.value)} contentBefore={<GaugeRegular />} /></Field>
              <label className="fail-toggle"><Checkbox checked={simulateFail} onChange={(_, data) => setSimulateFail(Boolean(data.checked))} /><span>模拟写入失败（演示：占用与现场读数保留，可按原请求恢复）</span></label>
              <div className="gauge-occupy-actions">
                <Button appearance="primary" onClick={submitGaugeMeasurement} disabled={!cardGauge}>提交测量</Button>
                {latestMeasurement?.writeFailed && <Button appearance="secondary" icon={<ArrowSyncRegular />} onClick={submitGaugeMeasurement}>按原请求恢复</Button>}
              </div>
              {latestMeasurement?.writeFailed && <MessageBar intent="warning"><MessageBarBody>写入失败：压力表 {cardGauge?.id} 占用与现场读数 {latestMeasurement.value} 已保留，幂等键 {latestMeasurement.idempotencyKey}，可按原请求恢复。</MessageBarBody></MessageBar>}
            </div>
            <div className="gauge-chain-status">
              <h3>3 · 链状态与复测</h3>
              {latestMeasurement ? (
                <div className="chain-mini">
                  <div className="chain-mini-row"><span>测量</span><Badge appearance="tint" color={latestMeasurement.status === '有效' ? 'success' : latestMeasurement.status === '失效' ? 'danger' : 'warning'}>{latestMeasurement.status}</Badge><strong>{latestMeasurement.value}</strong></div>
                  <div className="chain-mini-row"><span>校准证</span><Badge appearance="tint" color={latestMeasurement.certStatus === '有效' ? 'success' : 'danger'}>{latestMeasurement.certStatus}</Badge><small>{latestMeasurement.certNo}</small></div>
                  <div className="chain-mini-row"><span>阶段签字</span>{(() => { const sig = state.signatures.find((item) => item.stage === card.stage.replace('签署', '')); return sig ? <Badge appearance="tint" color={sig.status === '已签署' && !sig.invalid ? 'success' : 'danger'}>{sig.invalid ? '已失效' : sig.status}</Badge> : <Badge>无</Badge>; })()}</div>
                  {latestMeasurement.originalValue && <div className="chain-mini-row"><span>原值</span><small className="original-value">{latestMeasurement.originalValue}（保留待复测）</small></div>}
                  {latestMeasurement.status === '失效' && <Button appearance="primary" size="small" onClick={() => openRetest(latestMeasurement.id)}>申请复测</Button>}
                  {latestMeasurement.status === '待复测' && latestMeasurement.retestConfirmedBy && <><MessageBar intent="success"><MessageBarBody>复测已由 {latestMeasurement.retestConfirmedBy} 确认（{latestMeasurement.retestConfirmedAt}）。</MessageBarBody></MessageBar><Button appearance="primary" size="small" onClick={() => openRetest(latestMeasurement.id)}>执行复测</Button></>}
                </div>
              ) : <small>尚未建立测量链。</small>}
              <Button appearance="subtle" size="small" onClick={() => dispatch(bumpCardRevision({ cardId: card.id }))}>工卡版本变更（演示失效）</Button>
            </div>
          </div>
        </section>
      )}
      <Dialog open={overrideOpen} onOpenChange={(_, data) => setOverrideOpen(data.open)}><DialogSurface><DialogBody><DialogTitle>超差授权处理</DialogTitle><DialogContent>批准后将在工卡中记录授权人、工程指令编号与处置依据，原始测量值不会被覆盖。<Field label="工程指令编号" required className="dialog-field"><Input defaultValue="EO-2026-1147" /></Field><Field label="授权依据" required className="dialog-field"><Textarea defaultValue="按 AMM 容差分析并经工程部门确认，允许执行复测与系统恢复。" /></Field></DialogContent><DialogActions><Button appearance="secondary" onClick={() => setOverrideOpen(false)}>取消</Button><Button appearance="primary" onClick={() => { dispatch(authorizeOverride()); setOverrideOpen(false); }}>确认授权</Button></DialogActions></DialogBody></DialogSurface></Dialog>
      <Dialog open={Boolean(retestFor)} onOpenChange={(_, data) => { if (!data.open) setRetestFor(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{retestStep === 'confirm' ? '复测授权确认' : '执行复测'}</DialogTitle>
            <DialogContent>
              {retestStep === 'confirm'
                ? '校准证、量程或工卡版本变更导致原测量与阶段签字失效，原值保留待复测。复测须由质量授权人确认后重新建立测量链。'
                : '复测已授权。请占用有效压力表并输入现场读数，原测量值保留在链记录中。'}
              {retestStep === 'confirm'
                ? <Field label="质量授权人" required className="dialog-field"><Input value={retestAuthority} onChange={(_, data) => setRetestAuthority(data.value)} placeholder="如：质量经理 · 周敏" /></Field>
                : <><Field label="复测压力表" required className="dialog-field"><select value={retestGaugeId} onChange={(event) => setRetestGaugeId(event.target.value)}><option value="">请选择有效压力表</option>{availableGauges.map((gauge) => <option key={gauge.id} value={gauge.id}>{gauge.id} {gauge.name} · {gauge.range}</option>)}</select></Field><Field label="复测读数" className="dialog-field"><Input value={retestValue || measurement} onChange={(_, data) => setRetestValue(data.value)} contentBefore={<GaugeRegular />} /></Field></>}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setRetestFor(null)}>取消</Button>
              <Button appearance="primary" onClick={confirmRetestDialog}>{retestStep === 'confirm' ? '确认授权复测' : '提交复测'}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

function Release() {
  const state = useSelector((root: RootState) => root.maintenance);
  const dispatch = useDispatch();
  const [tab, setTab] = useState('open');
  const blockers = state.cards.filter((card) => card.status !== '已完成' && card.status !== '未开始');
  const allSigned = state.signatures.every((item) => item.status === '已签署' && !item.invalid);
  const chainBroken = state.measurements.some((item) => item.status === '失效');
  return (
    <div className="page">
      <PageHeading eyebrow="RELEASE REVIEW / B-7891" title="放行审阅" description="核对未关闭项目、重复缺陷、关键证据与阶段签字；测量链失效时不得放行。" actions={<Button appearance="primary" icon={<LockClosedRegular />} disabled={!allSigned || blockers.some((card) => card.status === '待授权') || chainBroken} onClick={() => dispatch(releasePackage())}>{state.released ? '工作包已锁定' : '锁定并放行'}</Button>} />
      {state.released && <MessageBar intent="success" className="top-message"><MessageBarBody>工作包已锁定，形成只读放行基线并纳入审计记录。</MessageBarBody></MessageBar>}
      {chainBroken && <MessageBar intent="error" className="top-message"><MessageBarBody><strong>测量链失效：</strong>存在校准证、量程或工卡版本变更导致的失效测量与签字，原值保留待复测，复测并重新签署前不能放行。</MessageBarBody></MessageBar>}
      <div className="release-grid">
        <section className="panel release-main">
          <TabList selectedValue={tab} onTabSelect={(_, data) => setTab(String(data.value))}><Tab value="open">未关闭项目 <Badge>{blockers.length}</Badge></Tab><Tab value="repeat">重复缺陷 <Badge>2</Badge></Tab><Tab value="evidence">关键证据 <Badge>12</Badge></Tab></TabList>
          <div className="tab-body">
            {tab === 'open' && blockers.map((card) => <div className="review-item" key={card.id}><span className={`risk-icon ${card.status === '待授权' ? 'danger' : ''}`}><AlertRegular /></span><div><strong>{card.id} · {card.title}</strong><p>{card.finding || '工卡正在执行，完成后需由放行人员复核。'}</p><small>{card.zone} · 负责人 宋杰 · 要求证据 {card.evidence}</small></div><Badge appearance="tint" color={card.status === '待授权' ? 'danger' : 'warning'}>{card.status}</Badge></div>)}
            {tab === 'repeat' && <><div className="review-item"><span className="risk-icon danger"><HistoryRegular /></span><div><strong>液压系统压力偏低 · 第 3 次记录</strong><p>2026-08-16、09-02、09-29 均在系统 A 出现压力低于目标值。</p><small>建议移交可靠性分析，并关联历史排故记录。</small></div><Badge appearance="tint" color="danger">关键</Badge></div><div className="review-item"><span className="risk-icon"><HistoryRegular /></span><div><strong>APU 启动时间延长</strong><p>最近两次航线记录均略高于机队均值。</p><small>非放行阻塞项，建议后续监控。</small></div><Badge appearance="tint" color="warning">观察</Badge></div></>}
            {tab === 'evidence' && <div className="evidence-grid">{['液压系统测试记录.pdf', '发动机孔探照片_01.jpg', 'AD 执行签署页.pdf', '时寿件履历截图.png', '超差工程指令.pdf', '见证人签字单.pdf'].map((file) => <div className="evidence-tile" key={file}><DocumentBulletListRegular /><strong>{file}</strong><span>已绑定工卡 · 已核验</span></div>)}</div>}
          </div>
        </section>
        <aside className="release-side">
          <section className="panel signoff-card"><div className="panel-head"><h2>分阶段签字</h2><span>{state.signatures.filter((item) => item.status === '已签署' && !item.invalid).length} / 4</span></div>{state.signatures.map((item) => <div className="signoff-row" key={item.stage}><div><span>{item.stage}</span><strong>{item.actor}</strong><small>{item.time}</small></div>{item.invalid ? <Badge appearance="tint" color="danger">已失效 · 待重签</Badge> : item.status === '已签署' ? <Badge appearance="tint" color="success">已签署</Badge> : <Button size="small" appearance="primary" onClick={() => dispatch(signStage(item.stage))}>签署</Button>}</div>)}</section>
          <section className="panel release-gate-card"><LockClosedRegular /><h3>放行门禁</h3><label><Checkbox checked={!blockers.some((card) => card.status === '待授权')} readOnly /> 无待授权超差项目</label><label><Checkbox checked={state.cards.filter((card) => card.status === '已完成').length >= 6} readOnly /> 关键工卡完成率 ≥ 75%</label><label><Checkbox checked={allSigned} readOnly /> 四个阶段均完成电子签署</label><label><Checkbox checked={!chainBroken} readOnly /> 测量链有效（无失效测量 / 签字）</label><label><Checkbox checked /> 审计记录和证据附件完整</label></section>
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
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'B7891-48A-audit.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const diffs = useMemo(() => [
    { card: 'CARD-03', field: '容差', from: '≥ 2800 psi / 10 min', to: '≥ 2850 psi / 10 min', reason: 'AMM 临时修订 TR-114' },
    { card: 'CARD-07', field: '依赖', from: 'CARD-02', to: 'CARD-03', reason: '试车前置条件调整' },
    { card: 'CARD-08', field: '证据', from: '近 2 次记录', to: '近 3 次记录', reason: '可靠性复核要求' }
  ], []);
  return (
    <div className="page">
      <PageHeading eyebrow="AUDIT / VERSION CONTROL" title="审计与版本差异" description="对比工卡版本、查看操作历史并导出闭环证据。" actions={<Button appearance="primary" icon={<ArrowDownloadRegular />} onClick={downloadAudit}>导出审计记录</Button>} />
      <div className="audit-grid">
        <section className="panel diff-panel"><div className="panel-head"><div><h2>工卡版本差异</h2><span>R6 → R7 · 3 处变更</span></div><select value={selected} onChange={(event) => setSelected(event.target.value)}><option>R7</option><option>R6</option><option>R5</option></select></div><div className="diff-table"><div className="diff-head"><span>工卡</span><span>字段</span><span>原值</span><span>新值 / 原因</span></div>{diffs.map((diff) => <div className="diff-row" key={`${diff.card}-${diff.field}`}><strong>{diff.card}</strong><span>{diff.field}</span><del>{diff.from}</del><div><ins>{diff.to}</ins><small>{diff.reason}</small></div></div>)}</div></section>
        <section className="panel audit-panel"><div className="panel-head"><div><h2>完整审计时间线</h2><span>{state.audit.length} 条记录</span></div><HistoryRegular /></div>{state.audit.map((item, index) => <div className="audit-row" key={`${item.time}-${index}`}><span className="timeline-dot" /><div><strong>{item.action}</strong><p>{item.detail}</p><small>{item.time} · {item.actor}</small></div></div>)}</section>
      </div>
    </div>
  );
}

function GaugesPage() {
  const state = useSelector((root: RootState) => root.maintenance);
  const dispatch = useDispatch();
  const [rangeDrafts, setRangeDrafts] = useState<Record<string, string>>({});
  const statusColor = (status: string) => (status === '有效' ? 'success' : status === '到期' ? 'warning' : 'danger');
  return (
    <div className="page">
      <PageHeading
        eyebrow="GAUGE & CALIBRATION"
        title="压力表台账与校准链"
        description="每只压力表与校准证绑定；校准状态、量程或工卡版本一变，关联测量与阶段签字立即失效，原值保留待复测。"
      />
      <MessageBar intent="info" className="top-message">
        <MessageBarBody>
          <strong>放行链：</strong>压力测量 → 校准证 → 阶段签字 → 放行基线。任一环节失效，后续环节不得带隐患放行；复测由质量授权人确认后重新建立。
        </MessageBarBody>
      </MessageBar>
      <div className="panel">
        <div className="panel-head"><div><h2>共用液压压力表</h2><span>机库共用 · 先到者占用 · 证到期或撤掉即失效</span></div><Badge appearance="tint">{state.gauges.length} 只</Badge></div>
        <div className="gauge-table">
          <div className="gauge-head"><span>表号 / 名称</span><span>量程</span><span>校准证</span><span>占用</span><span>关联测量</span><span>操作</span></div>
          {state.gauges.map((gauge) => {
            const linked = state.measurements.filter((item) => item.gaugeId === gauge.id);
            const invalidCount = linked.filter((item) => item.status === '失效').length;
            return (
              <div className="gauge-row" key={gauge.id}>
                <div><strong>{gauge.id}</strong><small>{gauge.name}</small></div>
                <div>
                  <input
                    className="range-input"
                    value={rangeDrafts[gauge.id] ?? gauge.range}
                    onChange={(event) => setRangeDrafts((prev) => ({ ...prev, [gauge.id]: event.target.value }))}
                  />
                  <Button size="small" appearance="subtle" onClick={() => { const next = rangeDrafts[gauge.id]; if (next && next !== gauge.range) dispatch(changeGaugeRange({ gaugeId: gauge.id, range: next })); }}>变更量程</Button>
                </div>
                <div>
                  <Badge appearance="tint" color={statusColor(gauge.certStatus)}>{gauge.certStatus}</Badge>
                  <small>{gauge.certNo} · 至 {gauge.certExpiry}</small>
                </div>
                <div>{gauge.occupiedBy ? <Tag appearance="outline" color="warning">{gauge.occupiedBy} 占用中</Tag> : <small>空闲</small>}{gauge.occupiedAt && <small>{gauge.occupiedAt}</small>}</div>
                <div>
                  <small>{linked.length} 条 · {invalidCount > 0 ? <span className="invalid-text">{invalidCount} 条失效</span> : '全部有效'}</small>
                </div>
                <div className="gauge-actions">
                  {gauge.certStatus === '有效'
                    ? <Button size="small" appearance="secondary" onClick={() => dispatch(changeGaugeCertStatus({ gaugeId: gauge.id, certStatus: '到期' }))}>证到期</Button>
                    : <Button size="small" appearance="primary" onClick={() => dispatch(changeGaugeCertStatus({ gaugeId: gauge.id, certStatus: '有效' }))}>恢复有效</Button>}
                  {gauge.certStatus !== '已撤' && <Button size="small" appearance="secondary" onClick={() => dispatch(changeGaugeCertStatus({ gaugeId: gauge.id, certStatus: '已撤' }))}>撤证</Button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <section className="panel chain-panel">
        <div className="panel-head"><div><h2>测量与签字链</h2><span>原值保留 · 复测由质量授权人确认</span></div></div>
        {state.measurements.length === 0 && <div className="chain-empty">暂无压力测量记录。在工卡执行中占用压力表并提交测量。</div>}
        {state.measurements.map((record) => {
          const card = state.cards.find((item) => item.id === record.cardId);
          const stageName = card?.stage.replace('签署', '') ?? '';
          const signature = state.signatures.find((item) => item.stage === stageName);
          return (
            <div className="chain-row" key={record.id}>
              <div className="chain-node">
                <Badge appearance="tint" color={record.status === '有效' ? 'success' : record.status === '失效' ? 'danger' : 'warning'}>{record.status}</Badge>
                <strong>{record.value}</strong>
                <small>{record.id} · {record.cardId} · {record.measuredAt}</small>
                {record.originalValue && <small className="original-value">原值保留：{record.originalValue}</small>}
                {record.invalidReason && <small className="invalid-text">{record.invalidReason}</small>}
              </div>
              <i />
              <div className="chain-node">
                <Badge appearance="tint" color={record.certStatus === '有效' ? 'success' : 'danger'}>{record.certStatus}</Badge>
                <strong>{record.certNo}</strong>
                <small>{record.gaugeName}</small>
              </div>
              <i />
              <div className="chain-node">
                {signature
                  ? <><Badge appearance="tint" color={signature.status === '已签署' && !signature.invalid ? 'success' : 'danger'}>{signature.invalid ? '已失效' : signature.status}</Badge><strong>{signature.stage}签署</strong><small>{signature.actor} · {signature.time}</small></>
                  : <small>无关联签字</small>}
              </div>
              <i />
              <div className="chain-node">
                <Badge appearance="tint" color={state.released ? 'success' : 'informative'}>{state.released ? '已锁定' : '未锁定'}</Badge>
                <strong>放行基线</strong>
                <small>WP-B7891-04</small>
              </div>
            </div>
          );
        })}
      </section>
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
        <Shell><Routes><Route path="/" element={<Overview />} /><Route path="/execution" element={<Execution />} /><Route path="/gauges" element={<GaugesPage />} /><Route path="/release" element={<Release />} /><Route path="/audit" element={<Audit />} /><Route path="*" element={<NotFound />} /></Routes></Shell>
      </BrowserRouter>
    </FluentProvider>
  );
}
