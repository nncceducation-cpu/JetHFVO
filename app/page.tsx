"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import {
  assessmentFingerprint,
  defaultXrayAssessment,
  getIntegratedXrayGuidance,
  summarizeAssessment,
  type EttPosition,
  type ImageQuality,
  type LungVolume,
  type XrayAssessment,
  type XrayFinding,
} from "./xray-guidance";

const pathways = {
  hypoxemia: {
    label: "Hypoxemia", color: "oxygen", title: "Think lung volume first", badge: "PEEP / MAP",
    action: "Raise PEEP/MAP stepwise per local protocol; titrate FiO₂ while reassessing recruitment and hemodynamics.",
    checks: ["Confirm ET tube position and patency", "Assess chest expansion and radiographic lung volume", "Consider 1–5/min conventional recruitment breaths when atelectasis is the issue"],
    avoid: "Do not chase oxygenation primarily with jet rate.",
  },
  hypercapnia: {
    label: "High CO₂", color: "ventilation", title: "Increase jet ΔP first", badge: "JET PIP",
    action: "Increase jet PIP in small steps, guided by blood gas and chest vibration. If air trapping is suspected, lower rate to lengthen expiration.",
    checks: ["Confirm visible chest vibration", "Check tube and adapter for obstruction or malposition", "Review the trend and repeat gas at the locally specified interval"],
    avoid: "A higher rate can worsen gas trapping in long time-constant lungs.",
  },
  lowco2: {
    label: "Low CO₂", color: "warning", title: "Reduce jet driving pressure", badge: "LOWER ΔP",
    action: "Lower jet PIP/ΔP in small steps and repeat the gas promptly. Avoid rapid or large CO₂ swings in extremely preterm infants.",
    checks: ["Verify sample quality", "Review the recent CO₂ trajectory", "Reassess chest vibration after each change"],
    avoid: "Do not accept hypocarbia to obtain a normal pH.",
  },
  airtrap: {
    label: "Air trapping / BPD", color: "airway", title: "Create more expiratory time", badge: "LOWER RATE",
    action: "Lower jet rate toward the unit’s obstructive-lung range; keep Ti at 0.020 s unless an expert-directed exception applies.",
    checks: ["Look for hyperinflation and incomplete exhalation", "Minimize unnecessary conventional breaths", "Use enough PEEP to stent unstable airways when BPD physiology predominates"],
    avoid: "Do not reflexively raise rate for hypercapnia when trapping is present.",
  },
  nowiggle: {
    label: "No chest vibration", color: "delivery", title: "Check delivery before pressure", badge: "CIRCUIT / ETT",
    action: "Stay bedside, call the attending/RT, and verify monitored PIP and READY status, alarms or interruptions, the LifePort/circuit connection, and ET tube position and patency. If the infant is unstable, activate the unit emergency ventilation pathway.",
    checks: ["Look for disconnection, kink, water or device interruption", "Assess tube displacement or obstruction", "Confirm the conventional ventilator and physiologic monitoring remain connected"],
    avoid: "Do not increase jet PIP into a displaced or obstructed tube.",
  },
} as const;

const patterns = {
  rds: { name: "RDS / atelectatic", tone: "cyan", aim: "Recruit to optimal lung volume", settings: ["Rate: about 420/min", "Ti: 0.020 s", "PEEP: adequate for lung recruitment", "CV breaths: 1–5/min if needed"], note: "The 1997 trial defined its optimal-volume subgroup as PEEP at least 1 cm H₂O above baseline and/or at least 7 cm H₂O. Use current local targets." },
  leak: { name: "PIE / air leak", tone: "coral", aim: "Ventilate at the lowest effective pressure", settings: ["Rate: consider slower if hyperinflated", "Ti: 0.020 s", "Minimize driving pressure and MAP", "CV rate: 0 when leak is primary"], note: "Avoid active recruitment unless explicitly directed. Reassess expansion, gas exchange, and the leak frequently." },
  bpd: { name: "Evolving BPD", tone: "violet", aim: "Stent airways and allow long expiration", settings: ["Rate: often 240–420/min", "Ti: 0.020 s", "PEEP: may need to be higher for airway patency", "Minimize trapping"], note: "Evidence is limited. A small pilot used 310–420/min and targeted PaCO₂ 45–55 mmHg." },
} as const;

const findingOptions: { value: XrayFinding; label: string; help: string }[] = [
  { value: "diffuseLowAeration", label: "Diffuse low aeration / opacity", help: "Bilateral low aeration or diffuse opacity" },
  { value: "focalVolumeLoss", label: "Focal opacity with volume loss", help: "Lobar or segmental atelectatic pattern" },
  { value: "asymmetricAeration", label: "Asymmetric aeration", help: "Side-to-side or regional difference" },
  { value: "piePattern", label: "PIE pattern", help: "Linear or cystic interstitial lucencies" },
  { value: "pleuralAir", label: "Pleural air / pneumothorax", help: "Pleural line or abnormal lucency" },
];

type Pathway = keyof typeof pathways;
type Pattern = keyof typeof patterns;
type NumFieldProps = { label: string; value: string; onChange: (value: string) => void; unit: string; step?: string };

function NumField({ label, value, onChange, unit, step = "1" }: NumFieldProps) {
  return <label className="num-field"><span>{label}</span><div><input type="number" inputMode="decimal" step={step} value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} /><em>{unit}</em></div></label>;
}

function ChoiceGroup<T extends string>({ legend, value, options, onChange }: { legend: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return <fieldset className="reader-field"><legend>{legend}</legend><div className="reader-choices">{options.map((option) => <button type="button" key={option.value} className={value === option.value ? "active" : ""} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div></fieldset>;
}

export default function Home() {
  const [selected, setSelected] = useState<Pathway>("hypoxemia");
  const [pattern, setPattern] = useState<Pattern>("rds");
  const [pip, setPip] = useState("20");
  const [peep, setPeep] = useState("7");
  const [rate, setRate] = useState("420");
  const [ti, setTi] = useState("0.020");
  const [fio2, setFio2] = useState("0.40");
  const [cvRate, setCvRate] = useState("0");
  const [priorCo2, setPriorCo2] = useState("70");
  const [currentCo2, setCurrentCo2] = useState("60");
  const [xrayDraft, setXrayDraft] = useState<XrayAssessment>(defaultXrayAssessment);
  const [confirmedXray, setConfirmedXray] = useState<XrayAssessment | null>(null);
  const [attested, setAttested] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [inverted, setInverted] = useState(false);

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const plan = pathways[selected];
  const frame = patterns[pattern];
  const confirmedIsCurrent = Boolean(confirmedXray && assessmentFingerprint(confirmedXray) === assessmentFingerprint(xrayDraft));
  const integratedXray = useMemo(() => confirmedXray && confirmedIsCurrent ? getIntegratedXrayGuidance(confirmedXray) : null, [confirmedXray, confirmedIsCurrent]);

  const derived = useMemo(() => {
    const p = Number(pip), e = Number(peep), r = Number(rate), t = Number(ti), prev = Number(priorCo2), now = Number(currentCo2);
    const delta = p - e;
    const cycle = r > 0 ? 60 / r : 0;
    const te = Math.max(cycle - t, 0);
    const ratio = t > 0 ? te / t : 0;
    const pct = prev > 0 ? ((prev - now) / prev) * 100 : 0;
    return { delta, te, ratio, pct };
  }, [pip, peep, rate, ti, priorCo2, currentCo2]);

  const updateXray = (next: XrayAssessment) => { setXrayDraft(next); setAttested(false); };
  const toggleFinding = (finding: XrayFinding) => updateXray({ ...xrayDraft, findings: xrayDraft.findings.includes(finding) ? xrayDraft.findings.filter((item) => item !== finding) : [...xrayDraft.findings, finding] });
  const confirmXray = () => { if (attested) setConfirmedXray({ ...xrayDraft, findings: [...xrayDraft.findings] }); };
  const loadImage = (file: File | null) => { setImageFile(file); setImageUrl(file ? URL.createObjectURL(file) : null); };
  const clearXray = () => { setXrayDraft(defaultXrayAssessment); setConfirmedXray(null); setAttested(false); setImageFile(null); setImageUrl(null); setZoom(1); setBrightness(1); setContrast(1); setRotation(0); setInverted(false); };
  const reset = () => { setPip("20"); setPeep("7"); setRate("420"); setTi("0.020"); setFio2("0.40"); setCvRate("0"); setPriorCo2("70"); setCurrentCo2("60"); };

  return (
    <main>
      <header className="hero" id="top">
        <div className="brandline"><span className="pulse" /> NICU CALL TOOL <span className="version">HFJV • Bunnell Life Pulse</span></div>
        <div className="hero-grid"><div><h1>Jet at a glance</h1><p className="dek">A rapid bedside aid for extremely premature neonates. Read the film systematically, separate oxygenation from ventilation, then reassess.</p></div><button className="print-button" onClick={() => window.print()}>Print one-page view</button></div>
        <div className="safety"><strong>Safety boundary:</strong> For trained NICU clinicians. Confirm every finding and change against the official radiology report, unit protocol, attending plan, current device manual, and the infant’s response. This tool does not interpret images autonomously or generate patient-specific orders.</div>
      </header>

      <nav className="jump" aria-label="Page sections"><a href="#xray">CXR read</a><a href="#troubleshoot">Troubleshoot</a><a href="#snapshot">Settings</a><a href="#patterns">Lung pattern</a><a href="#checks">Safety</a><a href="#recovery">Recovery</a><a href="#evidence">Evidence</a></nav>

      <section className="principles" aria-label="Core controls">
        <article className="principle oxygen-card"><span className="eyebrow">OXYGENATION</span><strong>PEEP / MAP + FiO₂</strong><p>Recruit and maintain lung volume.</p></article>
        <div className="independent">INDEPENDENT<br />CONTROLS</div>
        <article className="principle ventilation-card"><span className="eyebrow">VENTILATION</span><strong>Jet ΔP + rate</strong><p>ΔP = jet PIP − PEEP.</p></article>
      </section>

      <section className="workspace xray-section" id="xray">
        <div className="section-heading"><div><span className="step">01</span><h2>Confirm the chest X-ray</h2></div><p>Draft → verify → integrate.</p></div>
        <p className="reader-intro">Use a de-identified PNG, JPEG, or WebP for local viewing, or complete the checklist while viewing the clinical PACS. The image stays in this browser tab and is never analyzed by the app.</p>
        <div className="reader-layout">
          <article className="image-reader">
            <div className="viewer-top"><div><span className="eyebrow">LOCAL VIEWER</span><strong>{imageFile?.name ?? "No image loaded"}</strong></div><label className="upload-button"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => loadImage(event.target.files?.[0] ?? null)} />Load de-identified image</label></div>
            <div className={`image-stage ${imageUrl ? "loaded" : ""}`}>
              {imageUrl ? <img src={imageUrl} alt="Locally loaded chest radiograph for clinician review" style={{ transform: `scale(${zoom}) rotate(${rotation}deg)`, filter: `brightness(${brightness}) contrast(${contrast}) invert(${inverted ? 1 : 0})` }} /> : <div className="empty-viewer"><span aria-hidden="true">CXR</span><strong>Review in PACS or load a local image</strong><p>No image is uploaded, stored, or automatically interpreted.</p></div>}
            </div>
            <div className="viewer-controls" aria-label="Image display controls">
              <label><span>Zoom</span><input type="range" min="0.75" max="2.5" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
              <label><span>Brightness</span><input type="range" min="0.5" max="1.8" step="0.05" value={brightness} onChange={(event) => setBrightness(Number(event.target.value))} /></label>
              <label><span>Contrast</span><input type="range" min="0.5" max="2.2" step="0.05" value={contrast} onChange={(event) => setContrast(Number(event.target.value))} /></label>
              <div className="viewer-buttons"><button type="button" onClick={() => setRotation((value) => (value + 90) % 360)}>Rotate 90°</button><button type="button" className={inverted ? "active" : ""} aria-pressed={inverted} onClick={() => setInverted((value) => !value)}>Invert</button></div>
            </div>
          </article>

          <article className="reader-form">
            <div className="read-order"><span>1</span> Image quality <b>→</b><span>2</span> ET tube <b>→</b><span>3</span> Volume <b>→</b><span>4</span> Pattern</div>
            <ChoiceGroup<ImageQuality> legend="Image quality" value={xrayDraft.imageQuality} options={[{ value: "adequate", label: "Adequate" }, { value: "limited", label: "Limited" }]} onChange={(imageQuality) => updateXray({ ...xrayDraft, imageQuality })} />
            <ChoiceGroup<EttPosition> legend="ET tube depth on this image" value={xrayDraft.ettPosition} options={[{ value: "appropriate", label: "Appropriate" }, { value: "high", label: "High" }, { value: "low", label: "Low / mainstem" }]} onChange={(ettPosition) => updateXray({ ...xrayDraft, ettPosition })} />
            <ChoiceGroup<LungVolume> legend="Overall lung volume" value={xrayDraft.lungVolume} options={[{ value: "low", label: "Low" }, { value: "target", label: "Target" }, { value: "high", label: "Hyperinflated" }]} onChange={(lungVolume) => updateXray({ ...xrayDraft, lungVolume })} />
            <fieldset className="reader-field findings"><legend>Observed pattern(s)</legend>{findingOptions.map((option) => <label key={option.value}><input type="checkbox" aria-label={option.label} checked={xrayDraft.findings.includes(option.value)} onChange={() => toggleFinding(option.value)} /><span><strong>{option.label}</strong><small>{option.help}</small></span></label>)}</fieldset>
            <div className="confirm-panel">
              <label><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} /><span>I reviewed the current image and clinical context, and these observations are ready to use as confirmed findings.</span></label>
              <div><button type="button" className="confirm-button" disabled={!attested} onClick={confirmXray}>Confirm and integrate</button><button type="button" className="clear-button" onClick={clearXray}>Clear</button></div>
            </div>
          </article>
        </div>

        <div className={`confirmation-state ${integratedXray?.highestLevel ?? "paused"}`} aria-live="polite">
          {integratedXray && confirmedXray ? <><div><span className="status-dot" /><strong>Confirmed findings are active in HFJV guidance</strong></div><ul>{summarizeAssessment(confirmedXray).map((item) => <li key={item}>{item}</li>)}</ul></> : <><div><span className="status-dot" /><strong>{confirmedXray ? "Findings changed: integration paused" : "No confirmed findings integrated"}</strong></div><p>{confirmedXray ? "Re-review and reconfirm the edited observations before they can affect guidance." : "Draft observations do not alter the HFJV pathway."}</p></>}
        </div>
      </section>

      <section className="workspace" id="troubleshoot">
        <div className="section-heading"><div><span className="step">02</span><h2>What is the problem now?</h2></div><p>Tap the dominant pattern.</p></div>
        <div className="issue-grid" role="group" aria-label="Select the dominant bedside problem">
          {(Object.keys(pathways) as Pathway[]).map((key) => <button key={key} className={`issue ${selected === key ? "active" : ""}`} onClick={() => setSelected(key)} aria-pressed={selected === key}><span className={`dot ${pathways[key].color}`} />{pathways[key].label}</button>)}
        </div>
        <article className={`action-card ${plan.color}`} aria-live="polite">
          <div className="action-top"><span>FIRST MOVE</span><span className="move-badge">{plan.badge}</span><span className="mode">{plan.label}</span></div>
          <h2>{plan.title}</h2><p className="primary-action">{plan.action}</p>
          <div className="action-columns"><div><h3>Before and after</h3><ul>{plan.checks.map((item) => <li key={item}>{item}</li>)}</ul></div><div className="avoid"><h3>Watch out</h3><p>{plan.avoid}</p></div></div>
          <div className={`xray-integration ${integratedXray?.highestLevel ?? "paused"}`}>
            <div className="integration-head"><span className="eyebrow">CONFIRMED CXR OVERRIDE CHECK</span><strong>{integratedXray ? `${integratedXray.priorities.length} integrated ${integratedXray.priorities.length === 1 ? "priority" : "priorities"}` : "Paused"}</strong></div>
            {integratedXray ? <div className="priority-list">{integratedXray.priorities.map((priority) => <article className={priority.level} key={priority.title}><span>{priority.level}</span><div><h3>{priority.title}</h3><p>{priority.detail}</p></div></article>)}</div> : <p>Only confirmed, unchanged observations appear here. Continue with the physiology pathway and bedside assessment.</p>}
          </div>
        </article>
      </section>

      <section className="band" id="snapshot"><div className="band-inner">
        <div className="section-heading light"><div><span className="step">03</span><h2>Settings snapshot</h2></div><button className="reset" onClick={reset}>Reset example</button></div>
        <p className="section-intro">Use as a scratchpad only. Nothing is saved, and no patient identifiers are requested.</p>
        <div className="settings-layout">
          <div className="input-panel"><NumField label="Jet PIP" value={pip} onChange={setPip} unit="cm H₂O" /><NumField label="PEEP" value={peep} onChange={setPeep} unit="cm H₂O" /><NumField label="Jet rate" value={rate} onChange={setRate} unit="/min" /><NumField label="Jet Ti" value={ti} onChange={setTi} unit="sec" step="0.001" /><NumField label="FiO₂" value={fio2} onChange={setFio2} unit="fraction" step="0.01" /><NumField label="CV rate" value={cvRate} onChange={setCvRate} unit="/min" /></div>
          <div className="derived-panel"><span className="eyebrow">CALCULATED</span><div className="metric primary"><strong>{Number.isFinite(derived.delta) ? derived.delta.toFixed(0) : "—"}</strong><span>cm H₂O jet ΔP</span></div><div className="metric-row"><div className="metric"><strong>{derived.te.toFixed(3)}</strong><span>sec passive Te</span></div><div className="metric"><strong>1:{derived.ratio.toFixed(1)}</strong><span>approx I:E</span></div></div>
            <div className={`signal ${derived.delta <= 0 ? "danger" : ""}`}>{derived.delta <= 0 ? "Jet PIP must exceed PEEP." : "Use the lowest effective ΔP; trend gas exchange and chest vibration."}</div>
            {Number(cvRate) > 5 && <div className="signal danger">CV rate is above the usual 0–5/min HFJV background range in the supplied guide. Verify the plan.</div>}
            {Number(ti) !== 0.02 && <div className="signal caution">Ti is usually kept at 0.020 s. Confirm any exception with the attending and device guidance.</div>}
          </div>
        </div>
        <div className="co2-card"><div><span className="eyebrow">ONE-HOUR CO₂ TREND</span><p>A ≥10% fall defined “response” in one retrospective cohort. It is not a universal treatment threshold.</p></div><div className="co2-inputs"><NumField label="Previous CO₂" value={priorCo2} onChange={setPriorCo2} unit="mmHg" /><span className="arrow">→</span><NumField label="Current CO₂" value={currentCo2} onChange={setCurrentCo2} unit="mmHg" /></div><div className={`trend ${derived.pct >= 10 ? "good" : "neutral"}`}><strong>{derived.pct >= 0 ? "↓" : "↑"} {Math.abs(derived.pct).toFixed(1)}%</strong><span>{derived.pct >= 10 ? "meets study responder definition" : "reassess trend and strategy"}</span></div></div>
      </div></section>

      <section className="workspace" id="patterns">
        <div className="section-heading"><div><span className="step">04</span><h2>Match the lung pattern</h2></div><p>These are frames, not orders.</p></div>
        <div className="pattern-tabs" role="group" aria-label="Select lung pattern">{(Object.keys(patterns) as Pattern[]).map((key) => <button key={key} onClick={() => setPattern(key)} className={pattern === key ? "active" : ""} aria-pressed={pattern === key}>{patterns[key].name}</button>)}</div>
        <article className={`pattern-card ${frame.tone}`}><div><span className="eyebrow">PRIMARY AIM</span><h3>{frame.aim}</h3><p>{frame.note}</p></div><ul>{frame.settings.map((item) => <li key={item}>{item}</li>)}</ul></article>
        <div className="manufacturer-note"><strong>Starting the Life Pulse:</strong> The current Bunnell quick-reference guide says to start jet PIP equal to the monitored conventional PIP, rate 420/min (or slower for larger/hyperinflated patients), Ti 0.020 s, then reduce conventional rate to 0–5/min and adjust PEEP for desired MAP and oxygenation. Local protocols may differ.</div>
      </section>

      <section className="check-section" id="checks"><div className="workspace">
        <div className="section-heading"><div><span className="step">05</span><h2>Safety checks</h2></div><p>Fast, deliberate, repeatable.</p></div>
        <div className="check-grid">
          <article><span className="check-number">A</span><h3>Before starting</h3><label><input type="checkbox" /> Conventional ventilator and physiologic monitoring connected</label><label><input type="checkbox" /> Correct LifePort adapter and circuit; tube position/patency checked</label><label><input type="checkbox" /> System and operational tests completed by trained staff</label></article>
          <article><span className="check-number">B</span><h3>At initiation</h3><label><input type="checkbox" /> Trained person remains bedside through water fill/start-up</label><label><input type="checkbox" /> Monitored PIP reaches set PIP and READY is illuminated</label><label><input type="checkbox" /> CV PIP below set jet PIP so interruptions stop</label></article>
          <article><span className="check-number">C</span><h3>After a change</h3><label><input type="checkbox" /> Recheck chest vibration, SpO₂, blood pressure and perfusion</label><label><input type="checkbox" /> Trend gas at locally specified interval; Bunnell guide suggests 30 min after initiation</label><label><input type="checkbox" /> Reassess lung volume, air leak, obstruction and hemodynamics</label></article>
        </div>
        <div className="red-flag"><strong>Sudden deterioration?</strong><span>Call the attending/RT, follow the unit emergency ventilation pathway, and rapidly assess disconnection or device failure, tube displacement/obstruction, pneumothorax, derecruitment, and hemodynamic compromise.</span></div>
      </div></section>

      <section className="workspace recovery" id="recovery">
        <div className="section-heading"><div><span className="step">06</span><h2>Recovery and exit strategy</h2></div><p>Plan early; individualize.</p></div>
        <div className="recovery-grid">
          <article className="wean-order"><span className="tag">COMMON WEANING SEQUENCE</span><h3><b>1</b> FiO₂ <i>then</i> <b>2</b> PEEP / MAP <i>then</i> <b>3</b> jet PIP / ΔP</h3><p>Use small pressure steps guided by gas exchange, lung volume, and clinical response. Rate is often held stable rather than used as the main weaning lever.</p></article>
          <article><span className="tag">EXTUBATION HUDDLE</span><h3>Confirm the whole plan</h3><ul><li>Clinical stability, gas trend, lung volume, and secretion burden</li><li>Caffeine strategy and post-extubation nCPAP/NIPPV per unit protocol</li><li>Direct extubation versus transition to conventional ventilation</li></ul></article>
        </div>
        <div className="recovery-caveat"><strong>Evidence boundary:</strong> A retrospective open-lung HFV cohort reported 90% success when infants were extubated at mean CDP 6.8 cm H₂O and mean FiO₂ 0.25. This was broader HFV evidence, not a validated HFJV threshold. Periextubation practices vary considerably across NICUs.</div>
      </section>

      <section className="workspace evidence" id="evidence">
        <div className="section-heading"><div><span className="step">07</span><h2>Evidence and limits</h2></div><p>What the aid is built on.</p></div>
        <div className="evidence-grid">
          <article><span className="tag">DEVICE</span><h3>Current operating frame</h3><p>Manufacturer quick-reference instructions support tandem conventional ventilation, rate 420/min as the usual starting point, Ti 0.020 s, CV rate 0–5/min, and PEEP titration to MAP/oxygenation.</p><a href="https://bunl.com/wp-content/uploads/2022/05/204_quick_reference_guide.pdf" target="_blank" rel="noreferrer">Bunnell Life Pulse 204 guide ↗</a></article>
          <article><span className="tag">CXR + HFJV</span><h3>Image findings modify the frame</h3><p>A neonatal HFJV guideline directs clinicians to review CXR for atelectasis, hyperinflation, or air leak and cautions that recruitment in air leak requires consultant discussion.</p><a href="https://www.pch.health.wa.gov.au/~/media/HSPs/CAHS/Documents/Health-Professionals/Neonatology-guidelines/Ventilation-High-Frequency-Jet-Ventilation.pdf" target="_blank" rel="noreferrer">CAHS neonatal HFJV guideline ↗</a></article>
          <article><span className="tag">RADIOGRAPHY</span><h3>Read quality and devices first</h3><p>Neonatal radiographs are sensitive to rotation and technique. ET tube depth, lung volume, and support devices should be assessed before the pulmonary pattern is interpreted.</p><a href="https://pubmed.ncbi.nlm.nih.gov/33737778/" target="_blank" rel="noreferrer">Sodhi et al., 2021 ↗</a></article>
          <article><span className="tag">RCT</span><h3>Optimal lung volume matters</h3><p>The 1997 RDS trial favored an optimal-volume HFJV strategy over low-volume HFJV, with less hypocarbia and fewer severe neuroimaging abnormalities in subgroup analysis.</p><a href="https://pubmed.ncbi.nlm.nih.gov/9310511/" target="_blank" rel="noreferrer">Keszler et al., 1997 ↗</a></article>
          <article><span className="tag">RCT</span><h3>PIE treatment success</h3><p>The 1991 PIE trial reported higher treatment success with HFJV than rapid-rate conventional ventilation, at lower peak and mean airway pressures. Survival by original assignment was identical.</p><a href="https://pubmed.ncbi.nlm.nih.gov/1906102/" target="_blank" rel="noreferrer">Keszler et al., 1991 ↗</a></article>
          <article><span className="tag">COHORT</span><h3>CO₂ stability, not a target</h3><p>A 2026 retrospective cohort associated peak PaCO₂ &lt;65, fluctuation &lt;25, and deviation &lt;15 mmHg from a 40–50 target with survival free of severe IVH. Association does not prove that applying these cutoffs improves outcomes.</p><a href="https://journals.sagepub.com/doi/10.1177/19433654261436794" target="_blank" rel="noreferrer">Rallis et al., 2026 ↗</a></article>
          <article><span className="tag">COHORT</span><h3>Direct extubation is feasible</h3><p>In 214 preterm infants managed with open-lung HFV, 90% were successfully extubated at a mean CDP of 6.8 cm H₂O and mean FiO₂ of 0.25. The authors called for prospective comparison.</p><a href="https://pubmed.ncbi.nlm.nih.gov/19057441/" target="_blank" rel="noreferrer">van Velzen et al., 2009 ↗</a></article>
          <article><span className="tag">SURVEY</span><h3>Extubation practice varies</h3><p>An international survey found wide variation in readiness testing, caffeine timing, post-extubation support, and the definition of extubation failure. Treat local protocol and clinical judgment as authoritative.</p><a href="https://pubmed.ncbi.nlm.nih.gov/26063193/" target="_blank" rel="noreferrer">Al-Mandari et al., 2015 ↗</a></article>
        </div>
        <div className="limits"><strong>Limits:</strong> This is a structured human read, not computer vision or a radiology report. A frontal image cannot establish tracheal rather than esophageal tube placement. No neonatal RCT directly compares HFJV with HFOV. BPD-specific evidence is a very small pilot. This aid intentionally does not recommend universal SpO₂ or PaCO₂ targets.</div>
      </section>

      <footer><a href="#top">Back to top ↑</a><span>Educational aid • Local image viewing only • No patient identifiers • Last evidence check: August 20, 2026</span></footer>
    </main>
  );
}
