import { useState, useMemo, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, LineChart, Line, ReferenceLine, AreaChart, Area,
} from "recharts";

// ── SUPABASE ────────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const TABLE = "bkw_monate";

async function sbFetch(path, opts={}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { "apikey":SUPABASE_KEY, "Authorization":`Bearer ${SUPABASE_KEY}`,
      "Content-Type":"application/json", "Prefer":opts.prefer||"return=representation", ...(opts.headers||{}) },
  });
  if (!res.ok) throw new Error(await res.text());
  const t = await res.text(); return t ? JSON.parse(t) : null;
}
const loadAll   = ()  => sbFetch(`${TABLE}?select=*&order=jahr.asc,monat.asc`);
const insertRow = (r) => sbFetch(TABLE, { method:"POST", body:JSON.stringify(r) });
const deleteRow = (id)=> sbFetch(`${TABLE}?id=eq.${id}`, { method:"DELETE", prefer:"" });

// ── SEED ────────────────────────────────────────────────────────────────────
const SEED = [
  { jahr:2025, monat:9,  zaehler_start:5461, zaehler_ende:5582, einsp_start:159, einsp_ende:180, produziert: 55.58, ins_haus: 50.35, zum_speicher:0, strompreis:0.3048, kommentar:"" },
  { jahr:2025, monat:10, zaehler_start:5582, zaehler_ende:5699, einsp_start:180, einsp_ende:193, produziert: 53.87, ins_haus: 46.33, zum_speicher:0, strompreis:0.3048, kommentar:"" },
  { jahr:2025, monat:11, zaehler_start:5699, zaehler_ende:5878, einsp_start:193, einsp_ende:198, produziert: 38.36, ins_haus: 32.16, zum_speicher:0, strompreis:0.3048, kommentar:"" },
  { jahr:2025, monat:12, zaehler_start:5878, zaehler_ende:6027, einsp_start:198, einsp_ende:204, produziert: 33.29, ins_haus: 25.99, zum_speicher:0, strompreis:0.3048, kommentar:"Abwesenheit 21.12.–02.01." },
  { jahr:2026, monat:1,  zaehler_start:6027, zaehler_ende:6225, einsp_start:204, einsp_ende:209, produziert: 36.61, ins_haus: 29.99, zum_speicher:0, strompreis:0.2871, kommentar:"Preissenkung auf 0,2871 €" },
  { jahr:2026, monat:2,  zaehler_start:6225, zaehler_ende:6392, einsp_start:209, einsp_ende:210, produziert: 36.49, ins_haus: 36.40, zum_speicher:0, strompreis:0.2871, kommentar:"Halber Monat: Akkuerw. + Smartmeter" },
  { jahr:2026, monat:3,  zaehler_start:6392, zaehler_ende:6488, einsp_start:210, einsp_ende:215, produziert:120.38, ins_haus:115.79, zum_speicher:0, strompreis:0.2871, kommentar:"" },
  { jahr:2026, monat:4,  zaehler_start:6488, zaehler_ende:6559, einsp_start:215, einsp_ende:240, produziert:150.35, ins_haus:129.28, zum_speicher:0, strompreis:0.2871, kommentar:"2 Tage Anker wg. WLAN nicht gemessen" },
  { jahr:2026, monat:5,  zaehler_start:6559, zaehler_ende:6648, einsp_start:240, einsp_ende:249, produziert:142.67, ins_haus:134.41, zum_speicher:0, strompreis:0.2871, kommentar:"" },
  { jahr:2026, monat:6,  zaehler_start:6648, zaehler_ende:6707, einsp_start:249, einsp_ende:270, produziert:150.12, ins_haus:131.19, zum_speicher:0, strompreis:0.2871, kommentar:"" },
  { jahr:2026, monat:7,  zaehler_start:6707, zaehler_ende:6729, einsp_start:270, einsp_ende:316, produziert:152.66, ins_haus:108.06, zum_speicher:0, strompreis:0.2871, kommentar:"3 Wochen Sommerurlaub" },
];

// ── CONSTANTS ───────────────────────────────────────────────────────────────
const INVESTITION_NETTO = 2043.95;
const CO2_FAKTOR = 0.380;
const SONNENSTUNDEN = {1:52,2:75,3:120,4:165,5:200,6:215,7:225,8:210,9:155,10:105,11:55,12:42};
const MONAT_NAMEN = ["","Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
const MONAT_LANG  = ["","Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

// ── BERECHNUNG ──────────────────────────────────────────────────────────────
function berechne(row) {
  const verbrauch      = row.zaehler_ende - row.zaehler_start;
  const eingespeist    = row.einsp_ende   - row.einsp_start;
  const einsatzZuhause = Number(row.ins_haus) + Number(row.zum_speicher||0);
  const eigenverbrauch = einsatzZuhause - eingespeist;
  const evQuote        = row.produziert>0 ? eigenverbrauch/row.produziert : 0;
  const gesamt         = verbrauch + einsatzZuhause;
  const autarkie       = gesamt>0 ? einsatzZuhause/gesamt : 0;
  const gespart        = eigenverbrauch * row.strompreis;
  const stromkosten    = verbrauch * row.strompreis;
  const co2            = eigenverbrauch * CO2_FAKTOR;
  const sonnenstunden  = SONNENSTUNDEN[row.monat]||0;
  return { ...row, verbrauch, eingespeist, einsatzZuhause, eigenverbrauch, evQuote, gesamt, autarkie, gespart, stromkosten, co2, sonnenstunden };
}

function breakEvenDate(data, inv) {
  let k=0;
  for (const r of data) { k+=r.gespart; if(k>=inv) return `${MONAT_LANG[r.monat]} ${r.jahr}`; }
  const avg = data.reduce((s,r)=>s+r.gespart,0)/data.length;
  const monate = Math.ceil((inv-k)/avg);
  const last = data[data.length-1];
  let m=last.monat, j=last.jahr;
  for(let i=0;i<monate;i++){m++;if(m>12){m=1;j++;}}
  return `${MONAT_LANG[m]} ${j}`;
}

// ── ZEITFENSTER ─────────────────────────────────────────────────────────────
// < 12 → alle; ≥ 12 → letztes Rolling Window; ≥ 24 → Jahresvergleich aktiv
function getWindow(data) {
  if (data.length < 12) return data;
  return data.slice(-12);
}

// ── STATISTIKEN ─────────────────────────────────────────────────────────────
function calcStats(data) {
  if (!data.length) return null;
  const currentYear = data[data.length-1].jahr;
  const dataYear    = data.filter(r=>r.jahr===currentYear);
  const last        = data[data.length-1];
  const prev        = data.length>=2 ? data[data.length-2] : null;
  const last3       = data.slice(-3);
  const prev3       = data.length>=6 ? data.slice(-6,-3) : null;

  const sum  = (arr, fn) => arr.reduce((s,r)=>s+fn(r), 0);
  const avg  = (arr, fn) => sum(arr,fn)/arr.length;
  const pct  = (a,b)     => b>0 ? ((a-b)/b)*100 : null;

  // Gesamt
  const gespart_ges    = sum(data, r=>r.gespart);
  const prod_ges       = sum(data, r=>r.produziert);
  const ev_ges         = sum(data, r=>r.eigenverbrauch);
  const einsp_ges      = sum(data, r=>r.eingespeist);
  const stromk_ges     = sum(data, r=>r.stromkosten);
  const co2_ges        = sum(data, r=>r.co2);
  const avgAut_ges     = avg(data, r=>r.autarkie);
  const avgPm          = gespart_ges/data.length;

  // Laufendes Jahr
  const gespart_yr     = sum(dataYear, r=>r.gespart);
  const prod_yr        = sum(dataYear, r=>r.produziert);
  const avgAut_yr      = dataYear.length ? avg(dataYear, r=>r.autarkie) : null;
  const co2_yr         = sum(dataYear, r=>r.co2);

  // Deltas
  const delta_mom_gespart  = prev ? pct(last.gespart, prev.gespart) : null;
  const delta_mom_prod     = prev ? pct(last.produziert, prev.produziert) : null;
  const delta_mom_autarkie = prev ? pct(last.autarkie, prev.autarkie) : null;

  const avg3_gespart   = avg(last3, r=>r.gespart);
  const avg3_autarkie  = avg(last3, r=>r.autarkie);
  const avg3_evq       = avg(last3, r=>r.evQuote);
  const delta_3m_gespart   = prev3 ? pct(avg3_gespart,  avg(prev3, r=>r.gespart))  : null;
  const delta_3m_autarkie  = prev3 ? pct(avg3_autarkie, avg(prev3, r=>r.autarkie)) : null;
  const delta_3m_evq       = prev3 ? pct(avg3_evq,      avg(prev3, r=>r.evQuote))  : null;

  // Best month
  const bestMonat = data.reduce((b,r)=>r.gespart>b.gespart?r:b, data[0]);

  return {
    gespart_ges, prod_ges, ev_ges, einsp_ges, stromk_ges, co2_ges, avgAut_ges, avgPm,
    gespart_yr, prod_yr, avgAut_yr, co2_yr, currentYear,
    last, prev,
    delta_mom_gespart, delta_mom_prod, delta_mom_autarkie,
    avg3_gespart, avg3_autarkie, avg3_evq,
    delta_3m_gespart, delta_3m_autarkie, delta_3m_evq,
    bestMonat, noch: INVESTITION_NETTO - gespart_ges,
    hasYearCompare: data.length >= 24,
  };
}

// ── CSV ──────────────────────────────────────────────────────────────────────
function exportCSV(data) {
  const h = ["Monat","Jahr","Netzverbr_kWh","Produziert_kWh","EinsatzZh_kWh","Eigenverbr_kWh","Eingespeist_kWh","EV_Quote_%","Autarkie_%","Gespart_EUR","Stromkosten_EUR","CO2_kg","Strompreis","Kommentar"];
  const rows = data.map(r=>[MONAT_NAMEN[r.monat],r.jahr,r.verbrauch.toFixed(2),r.produziert.toFixed(2),r.einsatzZuhause.toFixed(2),r.eigenverbrauch.toFixed(2),r.eingespeist.toFixed(2),(r.evQuote*100).toFixed(1),(r.autarkie*100).toFixed(1),r.gespart.toFixed(2),r.stromkosten.toFixed(2),r.co2.toFixed(2),r.strompreis.toFixed(4),`"${r.kommentar||""}"`]);
  const csv = [h.join(";"),...rows.map(r=>r.join(";"))].join("\n");
  const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=`bkw_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ── DESIGN ───────────────────────────────────────────────────────────────────
const S = {
  bg:"#0f172a", card:"#1e293b", card2:"#273449", border:"#334155",
  accent:"#f59e0b", green:"#34d399", blue:"#60a5fa", red:"#f87171",
  purple:"#a78bfa", text:"#f1f5f9", muted:"#94a3b8",
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
function fmt(n,dec=1)  { return typeof n==="number"?n.toFixed(dec):"–"; }
function fmtPct(n)     { return typeof n==="number"?(n*100).toFixed(1)+"%":"–"; }
function fmtEur(n)     { return typeof n==="number"?n.toFixed(2)+" €":"–"; }
function fmtDelta(d,inv=false) {
  if (d===null||d===undefined) return null;
  const up = inv ? d<0 : d>0;
  const color = up ? S.green : S.red;
  const arrow = d>0 ? "↑" : "↓";
  return { text:`${arrow} ${Math.abs(d).toFixed(1)}%`, color };
}

const TIPS = {
  "EV-Quote":"Anteil der produzierten Energie die selbst genutzt wurde",
  "Autarkie":"Anteil des Gesamtverbrauchs der durch Solar gedeckt wurde",
};

function InfoTip({term}) {
  const [show,setShow]=useState(false);
  if(!TIPS[term]) return null;
  return (
    <span style={{position:"relative",display:"inline-block",marginLeft:4}}>
      <span onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}
        style={{color:S.muted,cursor:"help",fontSize:11,border:`1px solid ${S.border}`,borderRadius:"50%",width:14,height:14,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>?</span>
      {show&&<div style={{position:"absolute",bottom:"120%",left:"50%",transform:"translateX(-50%)",background:S.card2,border:`1px solid ${S.border}`,borderRadius:8,padding:"8px 12px",fontSize:11,color:S.text,width:200,zIndex:200,lineHeight:1.5,whiteSpace:"normal"}}>{TIPS[term]}</div>}
    </span>
  );
}

function Delta({d, inv=false, size=11}) {
  const r = fmtDelta(d, inv);
  if (!r) return null;
  return <span style={{color:r.color,fontSize:size,fontWeight:600,marginLeft:4}}>{r.text}</span>;
}

const CTT = ({active,payload,label}) => {
  if(!active||!payload?.length) return null;
  return (
    <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:8,padding:"10px 14px",fontSize:13}}>
      <p style={{color:S.muted,marginBottom:6,fontWeight:600}}>{label}</p>
      {payload.map((p,i)=><p key={i} style={{color:p.color,margin:"2px 0"}}>{p.name}: <strong>{typeof p.value==="number"?p.value.toFixed(2):p.value}</strong></p>)}
    </div>
  );
};

function Field({label,value,onChange,type="number",step="1",placeholder="",error,required}) {
  return (
    <div>
      <label style={{color:error?S.red:S.muted,fontSize:11,fontWeight:600,display:"block",marginBottom:4,textTransform:"uppercase"}}>
        {label}{required&&<span style={{color:S.accent}}> *</span>}
      </label>
      <input type={type} step={step} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{width:"100%",background:S.card,border:`1px solid ${error?S.red:S.border}`,borderRadius:6,padding:"9px 10px",color:S.text,fontSize:14,boxSizing:"border-box"}}/>
      {error&&<div style={{color:S.red,fontSize:11,marginTop:3}}>{error}</div>}
    </div>
  );
}

function Toast({msg,type="success",onClose}) {
  return (
    <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:type==="error"?S.red:S.green,color:"#000",borderRadius:10,padding:"12px 24px",fontWeight:700,fontSize:14,zIndex:300,boxShadow:"0 4px 20px #0006",display:"flex",alignItems:"center",gap:10}}>
      {type==="success"?"✓":"⚠"} {msg}
      <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#000"}}>✕</button>
    </div>
  );
}

// ── KPI CARD with delta + year ────────────────────────────────────────────────
function KpiCard({label, value, sub, color, icon, yearVal, yearLabel, delta, deltaInv=false}) {
  const d = fmtDelta(delta, deltaInv);
  return (
    <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
        <div style={{color:S.muted,fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>{label}</div>
        <span style={{fontSize:20}}>{icon}</span>
      </div>
      <div style={{fontSize:26,fontWeight:800,color,letterSpacing:-1,margin:"6px 0 2px"}}>{value}</div>
      {yearVal && (
        <div style={{fontSize:12,color:S.muted,marginBottom:2}}>
          <span style={{color:S.text,fontWeight:600}}>{yearLabel}: </span>{yearVal}
          {d&&<span style={{color:d.color,fontSize:11,marginLeft:4}}>{d.text}</span>}
        </div>
      )}
      {!yearVal && d && (
        <div style={{fontSize:11,color:d.color,marginBottom:2}}>{d.text} ggü. Vormonat</div>
      )}
      <div style={{color:S.muted,fontSize:12}}>{sub}</div>
    </div>
  );
}

// ── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [rows,    setRows]   = useState([]);
  const [status,  setStatus] = useState("loading");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showForm, setShowForm]   = useState(false);
  const [seeding,  setSeeding]    = useState(false);
  const [errors,   setErrors]     = useState({});
  const [toast,    setToast]      = useState(null);
  const [spOpen,   setSpOpen]     = useState(false);
  const [delConfirm, setDelConfirm] = useState(null);

  const showToast = (msg,type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  const load = useCallback(async()=>{
    setStatus("loading");
    try { setRows(await loadAll()||[]); setStatus("ready"); }
    catch(e) { setStatus("error"); showToast("Supabase Verbindung fehlgeschlagen","error"); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  async function handleSeed() {
    setSeeding(true);
    try { for(const r of SEED) await insertRow(r); await load(); showToast("11 Monate importiert ✓"); }
    catch(e) { showToast("Import fehler: "+e.message,"error"); }
    setSeeding(false);
  }

  // Data pipeline
  const data     = useMemo(()=>rows.map(berechne),[rows]);
  const windowed = useMemo(()=>getWindow(data),[data]);    // für Diagramme
  const stats    = useMemo(()=>calcStats(data),[data]);

  // Form state
  const lastRaw  = rows.length>0 ? rows[rows.length-1] : SEED[SEED.length-1];
  const nextM    = () => { let m=lastRaw.monat+1,j=lastRaw.jahr; if(m>12){m=1;j++;} return {monat:m,jahr:j}; };
  const [form, setForm] = useState(()=>({...nextM(),zaehlerEnde:"",einspEnde:"",produziert:"",insHaus:"",zumSpeicher:"",strompreis:String(lastRaw.strompreis||"0.2871"),kommentar:""}));
  const sf = k=>v=>setForm(f=>({...f,[k]:v}));

  useEffect(()=>{
    if(rows.length>0){
      const last=rows[rows.length-1]; let m=last.monat+1,j=last.jahr; if(m>12){m=1;j++;}
      setForm(f=>({...f,monat:m,jahr:j,strompreis:String(last.strompreis)}));
    }
  },[rows]);

  // Responsive
  const [isMobile,setIsMobile] = useState(()=>typeof window!=="undefined"&&window.innerWidth<768);
  useEffect(()=>{
    if(typeof window==="undefined") return;
    const fn=()=>setIsMobile(window.innerWidth<768);
    window.addEventListener("resize",fn); return ()=>window.removeEventListener("resize",fn);
  },[]);

  // Preview
  const preview = useMemo(()=>{
    const z=Number(form.zaehlerEnde),e=Number(form.einspEnde),ih=Number(form.insHaus),zs=Number(form.zumSpeicher)||0,sp=Number(form.strompreis);
    if(!z||!e||!ih||!sp) return null;
    const verbrauch=z-lastRaw.zaehler_ende, eingespeist=e-lastRaw.einsp_ende;
    const einsatzZuhause=ih+zs, ev=einsatzZuhause-eingespeist;
    const gespart=ev*sp, stromkosten=verbrauch*sp, gesamt=verbrauch+einsatzZuhause;
    return { verbrauch, eingespeist, einsatzZuhause, ev, gespart, stromkosten, autarkie:gesamt>0?einsatzZuhause/gesamt:0, evQ:Number(form.produziert)>0?ev/Number(form.produziert):0 };
  },[form,lastRaw]);

  function validate() {
    const e={}, z=Number(form.zaehlerEnde), zP=lastRaw.zaehler_ende, ei=Number(form.einspEnde), eP=lastRaw.einsp_ende;
    if(!form.zaehlerEnde) e.zaehlerEnde="Pflichtfeld"; else if(z<=zP) e.zaehlerEnde=`Muss > ${zP}`;
    if(!form.einspEnde)   e.einspEnde="Pflichtfeld";   else if(ei<eP) e.einspEnde=`Muss ≥ ${eP}`;
    if(!form.produziert)  e.produziert="Pflichtfeld";
    if(!form.insHaus)     e.insHaus="Pflichtfeld";
    if(!form.strompreis)  e.strompreis="Pflichtfeld";
    return e;
  }

  async function handleAdd() {
    const errs=validate(); if(Object.keys(errs).length){setErrors(errs);return;}
    const newRow={ jahr:Number(form.jahr), monat:Number(form.monat),
      zaehler_start:lastRaw.zaehler_ende, zaehler_ende:Number(form.zaehlerEnde),
      einsp_start:lastRaw.einsp_ende, einsp_ende:Number(form.einspEnde),
      produziert:Number(form.produziert), ins_haus:Number(form.insHaus),
      zum_speicher:Number(form.zumSpeicher)||0, strompreis:Number(form.strompreis), kommentar:form.kommentar };
    try { await insertRow(newRow); await load(); setErrors({}); setShowForm(false); showToast(`${MONAT_NAMEN[form.monat]} ${form.jahr} gespeichert`); }
    catch(e) { showToast("Fehler: "+e.message,"error"); }
  }

  async function handleDelete(id,label) {
    try { await deleteRow(id); await load(); setDelConfirm(null); showToast(`${label} gelöscht`); }
    catch(e) { showToast("Fehler beim Löschen","error"); }
  }

  // Chart data — windowed
  const chartData = useMemo(()=>windowed.map(r=>({...r,monat:MONAT_NAMEN[r.monat]})),[windowed]);

  // Amort data — always all
  const amortData = useMemo(()=>{ let k=0; return data.map(r=>({name:`${MONAT_NAMEN[r.monat]} ${r.jahr}`,kumulativ:+(k+=r.gespart).toFixed(2)})); },[data]);

  const tabs=[{id:"dashboard",label:"Übersicht"},{id:"analyse",label:"Analyse"},{id:"amort",label:"Amortisation"},{id:"daten",label:"Monatsdaten"}];

  // ── LOADING ──
  if(status==="loading") return(
    <div style={{background:S.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:S.muted,fontSize:16}}>
      <div style={{textAlign:"center"}}><div style={{fontSize:48,marginBottom:16}}>☀️</div><div>Lade Daten…</div></div>
    </div>
  );

  // ── EMPTY ──
  if(status==="ready"&&rows.length===0) return(
    <div style={{background:S.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:S.text,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{textAlign:"center",maxWidth:400,padding:32}}>
        <div style={{fontSize:64,marginBottom:16}}>☀️</div>
        <div style={{fontSize:22,fontWeight:800,marginBottom:8}}>Balkonkraftwerk Tracker</div>
        <div style={{color:S.muted,marginBottom:32}}>Datenbank leer. Historische Daten importieren?</div>
        <button onClick={handleSeed} disabled={seeding} style={{background:S.accent,color:"#000",border:"none",borderRadius:10,padding:"14px 28px",fontWeight:800,fontSize:16,cursor:"pointer",width:"100%",marginBottom:12}}>
          {seeding?"Importiere…":"📥 Sep 2025 – Jul 2026 importieren"}
        </button>
        <button onClick={()=>{setRows([]);setStatus("ready-empty");setShowForm(true);}} style={{background:"none",border:`1px solid ${S.border}`,color:S.muted,borderRadius:10,padding:"12px 28px",fontWeight:600,fontSize:14,cursor:"pointer",width:"100%"}}>
          Leer starten
        </button>
      </div>
    </div>
  );

  // ── MOBILE ──
  if(isMobile&&data.length>0&&stats) {
    const last=data[data.length-1];
    const amortPct=Math.min(100,(stats.gespart_ges/INVESTITION_NETTO)*100);
    return(
      <div style={{background:S.bg,minHeight:"100vh",color:S.text,fontFamily:"'Inter',system-ui,sans-serif",padding:20,maxWidth:480,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:28}}>☀️</span>
            <div>
              <div style={{fontWeight:800,fontSize:17}}>BKW Tracker</div>
              <div style={{color:S.muted,fontSize:11}}>{rows.length} Monate gespeichert</div>
            </div>
          </div>
          <button onClick={()=>{setShowForm(true);setErrors({});}} style={{background:S.accent,color:"#000",border:"none",borderRadius:10,padding:"10px 16px",fontWeight:800,fontSize:14,cursor:"pointer"}}>
            + Eintragen
          </button>
        </div>

        <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:16,padding:20,marginBottom:16}}>
          <div style={{color:S.muted,fontSize:11,fontWeight:600,textTransform:"uppercase",marginBottom:12}}>
            Letzter Monat — {MONAT_NAMEN[last.monat]} {last.jahr}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
            {[["⚡","Produziert",`${last.produziert.toFixed(1)} kWh`,S.accent],[" 💰","Gespart",fmtEur(last.gespart),S.green],["🏠","Autarkie",fmtPct(last.autarkie),S.blue]].map(([icon,label,value,color])=>(
              <div key={label} style={{textAlign:"center"}}>
                <div style={{fontSize:20,marginBottom:4}}>{icon}</div>
                <div style={{color,fontWeight:800,fontSize:17}}>{value}</div>
                <div style={{color:S.muted,fontSize:10,textTransform:"uppercase"}}>{label}</div>
              </div>
            ))}
          </div>
          {stats.delta_mom_gespart!==null&&(
            <div style={{fontSize:12,color:S.muted,textAlign:"center"}}>
              Gespart: <Delta d={stats.delta_mom_gespart} size={12}/> ggü. Vormonat
            </div>
          )}
          {last.kommentar&&<div style={{background:S.bg,borderRadius:8,padding:"8px 12px",fontSize:12,color:S.muted,marginTop:8}}>💬 {last.kommentar}</div>}
        </div>

        <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:16,padding:20,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontWeight:700,fontSize:14}}>Amortisation</span>
            <span style={{color:S.accent,fontWeight:700}}>{amortPct.toFixed(1)}%</span>
          </div>
          <div style={{background:S.border,borderRadius:99,height:10,overflow:"hidden",marginBottom:6}}>
            <div style={{background:`linear-gradient(90deg,${S.accent},${S.green})`,height:"100%",borderRadius:99,width:`${amortPct.toFixed(1)}%`}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:S.muted}}>
            <span>{fmtEur(stats.gespart_ges)} gespart</span>
            <span>Break-even: <strong style={{color:S.accent}}>{breakEvenDate(data,INVESTITION_NETTO)}</strong></span>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          {[[`${stats.currentYear}`,fmtEur(stats.gespart_yr),"💰 Gespart",S.green],[`${stats.currentYear}`,fmtEur(stats.prod_yr)+" kWh","⚡ Produziert",S.accent]].map(([yr,v,l,c])=>(
            <div key={l} style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:14}}>
              <div style={{color:S.muted,fontSize:10,textTransform:"uppercase",marginBottom:4}}>{l} {yr}</div>
              <div style={{color:c,fontWeight:800,fontSize:18}}>{v}</div>
            </div>
          ))}
        </div>

        {showForm&&(
          <div style={{position:"fixed",inset:0,background:"#00000090",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:"16px 16px 0 0",padding:24,width:"100%",maxHeight:"92vh",overflowY:"auto"}}>
              <div style={{fontWeight:800,fontSize:17,marginBottom:6,display:"flex",justifyContent:"space-between"}}>
                <span>☀️ Monat eintragen</span>
                <button onClick={()=>setShowForm(false)} style={{background:"none",border:"none",color:S.muted,cursor:"pointer",fontSize:22}}>✕</button>
              </div>
              <div style={{color:S.muted,fontSize:12,marginBottom:16}}>Felder mit <span style={{color:S.accent}}>*</span> sind Pflichtfelder</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                <div>
                  <label style={{color:S.muted,fontSize:11,fontWeight:600,display:"block",marginBottom:4,textTransform:"uppercase"}}>Monat *</label>
                  <select value={form.monat} onChange={e=>setForm(f=>({...f,monat:Number(e.target.value)}))} style={{width:"100%",background:S.card,border:`1px solid ${S.border}`,borderRadius:6,padding:"9px 10px",color:S.text,fontSize:14,boxSizing:"border-box"}}>
                    {MONAT_LANG.slice(1).map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <Field label="Jahr" value={form.jahr} onChange={sf("jahr")} required/>
              </div>
              <div style={{background:S.bg,border:`1px solid ${S.border}`,borderRadius:10,padding:14,marginBottom:10}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>🔌 Zähler (Vormonat: {lastRaw.zaehler_ende} / {lastRaw.einsp_ende})</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <Field label="Verbrauch" value={form.zaehlerEnde} onChange={sf("zaehlerEnde")} placeholder={`> ${lastRaw.zaehler_ende}`} error={errors.zaehlerEnde} required/>
                  <Field label="Einspeisung" value={form.einspEnde} onChange={sf("einspEnde")} placeholder={`≥ ${lastRaw.einsp_ende}`} error={errors.einspEnde} required/>
                </div>
              </div>
              <div style={{background:S.bg,border:`1px solid ${S.border}`,borderRadius:10,padding:14,marginBottom:10}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>📱 Anker SOLIX App</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <Field label="Produziert (kWh)" value={form.produziert} step="0.01" onChange={sf("produziert")} error={errors.produziert} required/>
                  <div/>
                  <Field label="Ins Haus (kWh)" value={form.insHaus} step="0.01" onChange={sf("insHaus")} error={errors.insHaus} required/>
                  <Field label="Zum Speicher (kWh)" value={form.zumSpeicher} step="0.01" onChange={sf("zumSpeicher")}/>
                </div>
              </div>
              {preview&&(
                <div style={{background:`${S.green}15`,border:`1px solid ${S.green}40`,borderRadius:10,padding:12,marginBottom:12}}>
                  <div style={{color:S.green,fontWeight:700,fontSize:11,marginBottom:8,textTransform:"uppercase"}}>✓ Berechnet</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    {[["Gespart",fmtEur(preview.gespart),S.green],["Autarkie",fmtPct(preview.autarkie),S.blue],["EV-Quote",fmtPct(preview.evQ),S.blue]].map(([l,v,c])=>(
                      <div key={l}><div style={{color:S.muted,fontSize:10,textTransform:"uppercase"}}>{l}</div><div style={{color:c,fontWeight:700,fontSize:15}}>{v}</div></div>
                    ))}
                  </div>
                </div>
              )}
              {Object.keys(errors).length>0&&<div style={{background:`${S.red}18`,border:`1px solid ${S.red}50`,borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:12,color:S.red}}>Bitte alle Pflichtfelder ausfüllen.</div>}
              <button onClick={handleAdd} style={{width:"100%",background:S.accent,color:"#000",border:"none",borderRadius:10,padding:"14px",fontWeight:800,cursor:"pointer",fontSize:15}}>Monat speichern</button>
            </div>
          </div>
        )}
        {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      </div>
    );
  }

  // ── DESKTOP ──────────────────────────────────────────────────────────────────
  return(
    <div style={{background:S.bg,minHeight:"100vh",color:S.text,fontFamily:"'Inter',system-ui,sans-serif",fontSize:14}}>

      {/* HEADER */}
      <div style={{background:S.card,borderBottom:`1px solid ${S.border}`,padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:26}}>☀️</span>
          <div>
            <div style={{fontWeight:700,fontSize:17}}>Balkonkraftwerk Tracker</div>
            <div style={{color:S.muted,fontSize:11}}>1700 W · 1,6 kWh Speicher · {rows.length} Monate{data.length>=12?" · Letzte 12 Monate":""}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          {data.length>0&&<button onClick={()=>exportCSV(data)} style={{background:"none",border:`1px solid ${S.border}`,color:S.muted,borderRadius:8,padding:"8px 14px",fontWeight:600,cursor:"pointer",fontSize:12}}>↓ CSV</button>}
          <button onClick={()=>{setShowForm(true);setErrors({});}} style={{background:S.accent,color:"#000",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,cursor:"pointer",fontSize:13}}>+ Monat eintragen</button>
        </div>
      </div>

      {/* TABS */}
      <div style={{background:S.card,borderBottom:`1px solid ${S.border}`,padding:"0 24px",display:"flex",overflowX:"auto"}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            style={{background:"none",border:"none",borderBottom:activeTab===t.id?`2px solid ${S.accent}`:"2px solid transparent",color:activeTab===t.id?S.accent:S.muted,padding:"12px 16px",cursor:"pointer",fontWeight:600,fontSize:13,whiteSpace:"nowrap"}}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{padding:24,maxWidth:1100,margin:"0 auto"}}>

        {/* ── ÜBERSICHT ── */}
        {activeTab==="dashboard"&&stats&&(
          <div>
            {/* KPI Cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16,marginBottom:24}}>
              <KpiCard label="Gesamt gespart" value={fmtEur(stats.gespart_ges)} icon="💰" color={S.green}
                yearVal={fmtEur(stats.gespart_yr)} yearLabel={String(stats.currentYear)}
                delta={stats.delta_mom_gespart} sub={`Ø ${fmtEur(stats.avgPm)}/Monat`}/>
              <KpiCard label="Produziert" value={`${fmt(stats.prod_ges)} kWh`} icon="⚡" color={S.accent}
                yearVal={`${fmt(stats.prod_yr)} kWh`} yearLabel={String(stats.currentYear)}
                delta={stats.delta_mom_prod} sub={`${fmt(stats.ev_ges)} kWh Eigenverbrauch`}/>
              <KpiCard label="Ø Autarkie" value={fmtPct(stats.avgAut_ges)} icon="🏠" color={S.blue}
                yearVal={stats.avgAut_yr!==null?fmtPct(stats.avgAut_yr):null} yearLabel={String(stats.currentYear)}
                delta={stats.delta_mom_autarkie} sub="Solar-Anteil am Gesamtverbrauch"/>
              <KpiCard label="CO₂ gespart" value={`${fmt(stats.co2_ges/1000,2)} t`} icon="🌱" color={S.green}
                yearVal={`${fmt(stats.co2_yr)} kg`} yearLabel={String(stats.currentYear)}
                sub={`≈ ${fmt(stats.co2_ges/0.12)} km Autofahrt`}/>
            </div>

            {/* Amort */}
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20,marginBottom:24}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{fontWeight:700}}>Amortisationsfortschritt</span>
                <span style={{color:S.muted,fontSize:13}}>{fmtEur(stats.gespart_ges)} von {fmtEur(INVESTITION_NETTO)}</span>
              </div>
              <div style={{background:S.border,borderRadius:99,height:12,overflow:"hidden"}}>
                <div style={{background:`linear-gradient(90deg,${S.accent},${S.green})`,height:"100%",borderRadius:99,width:`${Math.min(100,(stats.gespart_ges/INVESTITION_NETTO)*100).toFixed(1)}%`,transition:"width 0.6s"}}/>
              </div>
              <div style={{color:S.muted,fontSize:12,marginTop:6,display:"flex",justifyContent:"space-between"}}>
                <span>{((stats.gespart_ges/INVESTITION_NETTO)*100).toFixed(1)}% amortisiert</span>
                <span>Break-even: <strong style={{color:S.accent}}>{breakEvenDate(data,INVESTITION_NETTO)}</strong></span>
              </div>
            </div>

            {/* Heatmap */}
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20,marginBottom:24}}>
              <div style={{fontWeight:700,marginBottom:4}}>Jahres-Heatmap — Produktion</div>
              <div style={{color:S.muted,fontSize:11,marginBottom:14}}>Alle Monate · dunkler = mehr Produktion</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6}}>
                {Array.from({length:12},(_,i)=>i+1).map(m=>{
                  const r=data.find(d=>d.monat===m);
                  const maxP=Math.max(...data.map(d=>d.produziert),1);
                  const intensity=r?r.produziert/maxP:0;
                  return(
                    <div key={m} style={{background:r?`rgba(245,158,11,${0.15+intensity*0.85})`:S.border,borderRadius:8,padding:"10px 6px",textAlign:"center",border:`1px solid ${r?`rgba(245,158,11,${0.3+intensity*0.5})`:S.border}`}}>
                      <div style={{fontSize:11,fontWeight:600,color:r?(intensity>0.5?"#000":S.text):S.muted}}>{MONAT_NAMEN[m]}</div>
                      <div style={{fontSize:10,color:r?(intensity>0.5?"#000":S.muted):S.border,marginTop:2}}>{r?r.produziert.toFixed(0)+" kWh":"–"}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Highlights + Trend */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16,marginBottom:24}}>
              <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:16}}>
                <div style={{color:S.muted,fontSize:11,fontWeight:600,textTransform:"uppercase",marginBottom:8}}>🏆 Bester Monat</div>
                <div style={{fontSize:20,fontWeight:800,color:S.accent}}>{MONAT_NAMEN[stats.bestMonat.monat]} {stats.bestMonat.jahr}</div>
                <div style={{color:S.muted,fontSize:12,marginTop:4}}>{fmtEur(stats.bestMonat.gespart)} · {fmt(stats.bestMonat.produziert)} kWh</div>
              </div>
              <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:16}}>
                <div style={{color:S.muted,fontSize:11,fontWeight:600,textTransform:"uppercase",marginBottom:8}}>📈 3-Monats-Entwicklung</div>
                <div style={{fontSize:20,fontWeight:800,color:S.blue}}>{fmtEur(stats.avg3_gespart)}<Delta d={stats.delta_3m_gespart} size={13}/></div>
                <div style={{color:S.muted,fontSize:12,marginTop:4}}>Ø Gespart · Autarkie: {fmtPct(stats.avg3_autarkie)}<Delta d={stats.delta_3m_autarkie} size={11}/></div>
              </div>
            </div>
          </div>
        )}

        {/* ── ANALYSE ── */}
        {activeTab==="analyse"&&stats&&(
          <div style={{display:"flex",flexDirection:"column",gap:24}}>

            {data.length>=12&&(
              <div style={{background:`${S.blue}18`,border:`1px solid ${S.blue}40`,borderRadius:10,padding:"10px 16px",fontSize:12,color:S.blue}}>
                📊 Diagramme zeigen die letzten 12 Monate ({MONAT_NAMEN[windowed[0].monat]} {windowed[0].jahr} – {MONAT_NAMEN[windowed[windowed.length-1].monat]} {windowed[windowed.length-1].jahr})
              </div>
            )}

            {/* Entwicklung 3M */}
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
              <div style={{fontWeight:700,marginBottom:4}}>📈 Entwicklung — 3-Monats-Vergleich</div>
              <div style={{color:S.muted,fontSize:11,marginBottom:16}}>Letzte 3 Monate vs. vorherige 3 Monate</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
                {[
                  ["Gespart",fmtEur(stats.avg3_gespart),stats.delta_3m_gespart,S.green],
                  ["Autarkie",fmtPct(stats.avg3_autarkie),stats.delta_3m_autarkie,S.blue],
                  ["EV-Quote",fmtPct(stats.avg3_evq),stats.delta_3m_evq,S.accent],
                ].map(([l,v,d,c])=>(
                  <div key={l} style={{background:S.bg,borderRadius:10,padding:14,textAlign:"center"}}>
                    <div style={{color:S.muted,fontSize:11,textTransform:"uppercase",marginBottom:6}}>{l} Ø</div>
                    <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
                    <div style={{marginTop:4}}>{d!==null?<Delta d={d} size={12}/>:<span style={{color:S.muted,fontSize:11}}>Noch kein Vergleich</span>}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sonnenstunden + Produktion nebeneinander */}
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
              <div style={{fontWeight:700,marginBottom:4}}>☀️ Sonnenstunden & Produktion</div>
              <div style={{color:S.muted,fontSize:11,marginBottom:16}}>Klimamittelwerte Rhein-Main · Produktion aus deinen Daten</div>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={chartData} margin={{top:0,right:10,left:-10,bottom:0}} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                  <XAxis dataKey="monat" stroke={S.muted} tick={{fontSize:12}}/>
                  <YAxis stroke={S.muted} tick={{fontSize:12}}/>
                  <Tooltip content={<CTT/>}/>
                  <Legend wrapperStyle={{color:S.muted,fontSize:12}}/>
                  <Bar dataKey="sonnenstunden" name="Sonnenstunden (h)" fill={S.accent} opacity={0.5} radius={[4,4,0,0]}/>
                  <Bar dataKey="produziert"    name="Produziert (kWh)"  fill={S.green}  radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Produktion, Einsatz, Einspeisung */}
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
              <div style={{fontWeight:700,marginBottom:16}}>Energiefluss — Produktion, Einsatz & Einspeisung (kWh)</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{top:0,right:10,left:-10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                  <XAxis dataKey="monat" stroke={S.muted} tick={{fontSize:12}}/>
                  <YAxis stroke={S.muted} tick={{fontSize:12}}/>
                  <Tooltip content={<CTT/>}/><Legend wrapperStyle={{color:S.muted,fontSize:12}}/>
                  <Bar dataKey="produziert"     name="Produziert"      fill={S.accent} radius={[4,4,0,0]}/>
                  <Bar dataKey="einsatzZuhause" name="Einsatz Zuhause" fill={S.green}  radius={[4,4,0,0]}/>
                  <Bar dataKey="eingespeist"    name="Eingespeist"     fill={S.blue}   radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Ersparnis vs Stromkosten */}
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
              <div style={{fontWeight:700,marginBottom:16}}>Ersparnis vs. Stromkosten (€)</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{top:0,right:10,left:-10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                  <XAxis dataKey="monat" stroke={S.muted} tick={{fontSize:12}}/>
                  <YAxis stroke={S.muted} tick={{fontSize:12}} tickFormatter={v=>`${v.toFixed(0)} €`}/>
                  <Tooltip content={<CTT/>} formatter={v=>[v.toFixed(2)+" €"]}/><Legend wrapperStyle={{color:S.muted,fontSize:12}}/>
                  <Bar dataKey="gespart"     name="Gespart (Solar)"    fill={S.green} radius={[4,4,0,0]}/>
                  <Bar dataKey="stromkosten" name="Stromkosten (Netz)" fill={S.red}   radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Autarkie + EV-Quote */}
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
              <div style={{fontWeight:700,marginBottom:4,display:"flex",alignItems:"center",gap:4}}>
                Autarkie & EV-Quote (%)<InfoTip term="Autarkie"/><InfoTip term="EV-Quote"/>
              </div>
              <div style={{color:S.muted,fontSize:11,marginBottom:12}}>Autarkie = Solar-Anteil am Gesamtverbrauch · EV-Quote = genutzter Anteil der Produktion</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{top:0,right:10,left:-10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                  <XAxis dataKey="monat" stroke={S.muted} tick={{fontSize:12}}/>
                  <YAxis stroke={S.muted} tick={{fontSize:12}} tickFormatter={v=>`${(v*100).toFixed(0)}%`}/>
                  <Tooltip content={<CTT/>} formatter={v=>[(v*100).toFixed(1)+"%"]}/><Legend wrapperStyle={{color:S.muted,fontSize:12}}/>
                  <Line type="monotone" dataKey="autarkie" name="Autarkie" stroke={S.green}  strokeWidth={2.5} dot={{r:4,fill:S.green}}/>
                  <Line type="monotone" dataKey="evQuote"  name="EV-Quote" stroke={S.accent} strokeWidth={2.5} dot={{r:4,fill:S.accent}}/>
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* CO2 */}
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
              <div style={{fontWeight:700,marginBottom:4}}>🌱 CO₂-Ersparnis kumuliert</div>
              <div style={{color:S.muted,fontSize:11,marginBottom:16}}>Basis: {CO2_FAKTOR} kg CO₂/kWh (Bundesschnitt 2024)</div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={(()=>{let k=0;return data.map(r=>({monat:MONAT_NAMEN[r.monat],kum:+(k+=r.co2).toFixed(1)}));})()}
                  margin={{top:0,right:10,left:-10,bottom:0}}>
                  <defs>
                    <linearGradient id="co2g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={S.green} stopOpacity={0.4}/>
                      <stop offset="95%" stopColor={S.green} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                  <XAxis dataKey="monat" stroke={S.muted} tick={{fontSize:12}}/>
                  <YAxis stroke={S.muted} tick={{fontSize:12}} tickFormatter={v=>`${v.toFixed(0)} kg`}/>
                  <Tooltip formatter={v=>[v.toFixed(1)+" kg CO₂"]} contentStyle={{background:S.card,border:`1px solid ${S.border}`}} labelStyle={{color:S.muted}}/>
                  <Area type="monotone" dataKey="kum" name="CO₂ gespart" stroke={S.green} fill="url(#co2g)" strokeWidth={2.5} dot={{r:3,fill:S.green}}/>
                </AreaChart>
              </ResponsiveContainer>
              <div style={{marginTop:12,display:"flex",gap:24,flexWrap:"wrap"}}>
                {[["Gesamt",`${fmt(stats.co2_ges)} kg`],[String(stats.currentYear),`${fmt(stats.co2_yr)} kg`],["= Autofahrt",`${fmt(stats.co2_ges/0.12)} km`],["Prognose/Jahr",`${fmt((stats.co2_ges/data.length)*12)} kg`]].map(([l,v])=>(
                  <div key={l}><div style={{color:S.muted,fontSize:11,textTransform:"uppercase"}}>{l}</div><div style={{color:S.green,fontWeight:700,fontSize:18}}>{v}</div></div>
                ))}
              </div>
            </div>

            {/* Prognosen */}
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
              <div style={{fontWeight:700,marginBottom:16}}>📅 Prognosen</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:16}}>
                {[
                  {label:"Hochrechnung/Jahr", value:fmtEur(stats.avgPm*12), sub:"Ø aller Monate × 12", color:S.green},
                  {label:"Break-even",        value:breakEvenDate(data,INVESTITION_NETTO), sub:"voraussichtliches Datum", color:S.accent},
                  {label:"3-Monats-Ø Gespart",value:fmtEur(stats.avg3_gespart), sub:stats.delta_3m_gespart!==null?`${stats.delta_3m_gespart>=0?"+":""}${stats.delta_3m_gespart.toFixed(1)}% vs. vorh. 3M`:"–", color:S.blue},
                ].map((k,i)=>(
                  <div key={i} style={{background:S.bg,borderRadius:10,padding:16}}>
                    <div style={{color:S.muted,fontSize:11,fontWeight:600,textTransform:"uppercase",marginBottom:6}}>{k.label}</div>
                    <div style={{fontSize:20,fontWeight:800,color:k.color}}>{k.value}</div>
                    <div style={{color:S.muted,fontSize:11,marginTop:4}}>{k.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Jahresvergleich — ab 24 Monaten */}
            {stats.hasYearCompare&&(
              <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
                <div style={{fontWeight:700,marginBottom:4}}>📆 Jahresvergleich</div>
                <div style={{color:S.muted,fontSize:11,marginBottom:16}}>Gleiche Monate im Jahresvergleich</div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={(()=>{
                    const years=[...new Set(data.map(r=>r.jahr))].sort();
                    const months=[...new Set(data.map(r=>r.monat))].sort((a,b)=>a-b);
                    return months.map(m=>({
                      monat:MONAT_NAMEN[m],
                      ...Object.fromEntries(years.map(y=>[String(y),(data.find(r=>r.monat===m&&r.jahr===y)||{}).gespart||null]))
                    }));
                  })()} margin={{top:0,right:10,left:-10,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                    <XAxis dataKey="monat" stroke={S.muted} tick={{fontSize:12}}/>
                    <YAxis stroke={S.muted} tick={{fontSize:12}} tickFormatter={v=>`${v.toFixed(0)} €`}/>
                    <Tooltip content={<CTT/>} formatter={v=>[v?v.toFixed(2)+" €":"–"]}/>
                    <Legend wrapperStyle={{color:S.muted,fontSize:12}}/>
                    {[...new Set(data.map(r=>r.jahr))].sort().map((y,i)=>(
                      <Line key={y} type="monotone" dataKey={String(y)} name={String(y)} stroke={[S.accent,S.green,S.blue][i%3]} strokeWidth={2} dot={{r:3}} connectNulls={false}/>
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* ── AMORTISATION ── */}
        {activeTab==="amort"&&stats&&(
          <div style={{display:"flex",flexDirection:"column",gap:24}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16}}>
              {[
                {label:"Investition netto",value:fmtEur(INVESTITION_NETTO),color:S.red,sub:"nach Zuschüssen"},
                {label:"Bisher gespart",   value:fmtEur(stats.gespart_ges),color:S.green,sub:`über ${data.length} Monate`},
                {label:"Noch offen",       value:fmtEur(Math.max(0,stats.noch)),color:S.accent,sub:"bis Break-even"},
                {label:"Break-even",       value:breakEvenDate(data,INVESTITION_NETTO),color:S.blue,sub:"voraussichtliches Datum"},
              ].map((k,i)=>(
                <div key={i} style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
                  <div style={{color:S.muted,fontSize:11,fontWeight:600,textTransform:"uppercase",marginBottom:8}}>{k.label}</div>
                  <div style={{fontSize:22,fontWeight:800,color:k.color}}>{k.value}</div>
                  <div style={{color:S.muted,fontSize:12,marginTop:4}}>{k.sub}</div>
                </div>
              ))}
            </div>
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
              <div style={{fontWeight:700,marginBottom:16}}>Kumulierte Ersparnis vs. Investitionsziel</div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={amortData} margin={{top:10,right:40,left:-10,bottom:0}}>
                  <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={S.green} stopOpacity={0.3}/><stop offset="95%" stopColor={S.green} stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                  <XAxis dataKey="name" stroke={S.muted} tick={{fontSize:11}} interval="preserveStartEnd"/>
                  <YAxis stroke={S.muted} tick={{fontSize:12}} tickFormatter={v=>`${v.toFixed(0)} €`}/>
                  <Tooltip content={<CTT/>} formatter={v=>[v.toFixed(2)+" €"]}/>
                  <ReferenceLine y={INVESTITION_NETTO} stroke={S.red} strokeDasharray="6 3" label={{value:`Ziel: ${fmtEur(INVESTITION_NETTO)}`,fill:S.red,fontSize:11,position:"right"}}/>
                  <Area type="monotone" dataKey="kumulativ" name="Kumuliert gespart" stroke={S.green} fill="url(#ag)" strokeWidth={2.5} dot={{r:4,fill:S.green}}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
              <div style={{fontWeight:700,marginBottom:12}}>Investitionsübersicht</div>
              <table style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
                <tbody>
                  {[["1. Solarpanel (Jul 2022)","702,00 €",false],["2–4 Solarpanel + Speicher (Sep 2025)","891,02 €",false],["Speichererweiterung (Feb 2026)","384,00 €",false],["Material","150,00 €",false],["Montage Smartmeter","291,93 €",false],["Brutto gesamt","2.418,95 €",true],["– Zuschuss Maintal","−300,00 €",false],["– Ersparnis 1. Panel (3 J. × 25 €)","−75,00 €",false]].map(([l,v,b],i)=>(
                    <tr key={i} style={{borderBottom:`1px solid ${S.border}20`}}>
                      <td style={{padding:"7px 12px",color:b?S.text:S.muted,fontWeight:b?700:400}}>{l}</td>
                      <td style={{padding:"7px 12px",textAlign:"right",color:b?S.text:S.muted,fontWeight:b?700:400}}>{v}</td>
                    </tr>
                  ))}
                  <tr style={{borderTop:`2px solid ${S.border}`}}>
                    <td style={{padding:"10px 12px",fontWeight:800}}>Netto Investition</td>
                    <td style={{padding:"10px 12px",textAlign:"right",color:S.accent,fontWeight:800,fontSize:16}}>2.043,95 €</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── MONATSDATEN ── */}
        {activeTab==="daten"&&(
          <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20,overflowX:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div>
                <div style={{fontWeight:700}}>Alle Monatsdaten</div>
                <div style={{color:S.muted,fontSize:11}}>Scroll horizontal für alle Spalten</div>
              </div>
              <button onClick={()=>exportCSV(data)} style={{background:"none",border:`1px solid ${S.border}`,color:S.muted,borderRadius:8,padding:"7px 14px",fontWeight:600,cursor:"pointer",fontSize:12}}>↓ CSV exportieren</button>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,whiteSpace:"nowrap"}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${S.border}`,color:S.muted}}>
                  {[["Monat"],["Netzverbr."],["Produziert"],["Einsatz Zh."],["Eigenverbr."],["Eingespeist"],["EV-Quote","EV-Quote"],["Autarkie","Autarkie"],["Gespart"],["Stromkosten"],["CO₂"],["☀ h"],["Kommentar"],[""]].map(([h,tip])=>(
                    <th key={h} style={{padding:"6px 10px",textAlign:"left",fontWeight:600}}>{h}{tip&&<InfoTip term={tip}/>}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((r,i)=>{
                  const prev=i>0?data[i-1]:null;
                  const dG=prev?((r.gespart-prev.gespart)/prev.gespart)*100:null;
                  return(
                    <tr key={i} style={{borderBottom:`1px solid ${S.border}20`}}>
                      <td style={{padding:"8px 10px",fontWeight:700}}>{MONAT_NAMEN[r.monat]} {r.jahr}</td>
                      <td style={{padding:"8px 10px"}}>{fmt(r.verbrauch)} kWh</td>
                      <td style={{padding:"8px 10px",color:S.accent}}>{fmt(r.produziert)} kWh</td>
                      <td style={{padding:"8px 10px",color:S.green,fontWeight:600}}>{fmt(r.einsatzZuhause)} kWh</td>
                      <td style={{padding:"8px 10px",color:S.muted}}>{fmt(r.eigenverbrauch)} kWh</td>
                      <td style={{padding:"8px 10px",color:S.blue}}>{fmt(r.eingespeist,0)} kWh</td>
                      <td style={{padding:"8px 10px"}}>{fmtPct(r.evQuote)}</td>
                      <td style={{padding:"8px 10px"}}>{fmtPct(r.autarkie)}</td>
                      <td style={{padding:"8px 10px",color:S.green,fontWeight:700}}>{fmtEur(r.gespart)}<Delta d={dG} size={10}/></td>
                      <td style={{padding:"8px 10px",color:S.red}}>{fmtEur(r.stromkosten)}</td>
                      <td style={{padding:"8px 10px",color:S.green}}>{fmt(r.co2,1)} kg</td>
                      <td style={{padding:"8px 10px",color:S.accent}}>{r.sonnenstunden}h</td>
                      <td style={{padding:"8px 10px",color:S.muted,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis"}}>{r.kommentar||"–"}</td>
                      <td style={{padding:"8px 10px"}}>
                        <button onClick={()=>setDelConfirm({id:r.id,label:`${MONAT_NAMEN[r.monat]} ${r.jahr}`})} style={{background:"none",border:`1px solid ${S.border}`,color:S.red,borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:11}}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{borderTop:`2px solid ${S.border}`,fontWeight:800}}>
                  <td style={{padding:"10px 10px"}}>GESAMT</td>
                  <td style={{padding:"10px 10px"}}>{fmt(data.reduce((s,r)=>s+r.verbrauch,0))} kWh</td>
                  <td style={{padding:"10px 10px",color:S.accent}}>{stats&&fmt(stats.prod_ges)} kWh</td>
                  <td style={{padding:"10px 10px",color:S.green}}>{stats&&fmt(data.reduce((s,r)=>s+r.einsatzZuhause,0))} kWh</td>
                  <td style={{padding:"10px 10px",color:S.muted}}>{stats&&fmt(stats.ev_ges)} kWh</td>
                  <td style={{padding:"10px 10px",color:S.blue}}>{stats&&fmt(stats.einsp_ges,0)} kWh</td>
                  <td colSpan={2} style={{padding:"10px 10px"}}>{stats&&fmtPct(stats.avgAut_ges)} Ø</td>
                  <td style={{padding:"10px 10px",color:S.green}}>{stats&&fmtEur(stats.gespart_ges)}</td>
                  <td style={{padding:"10px 10px",color:S.red}}>{stats&&fmtEur(stats.stromk_ges)}</td>
                  <td style={{padding:"10px 10px",color:S.green}}>{stats&&fmt(stats.co2_ges,1)} kg</td>
                  <td colSpan={3}/>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL ── */}
      {showForm&&(
        <div style={{position:"fixed",inset:0,background:"#00000090",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16}}>
          <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:16,padding:28,width:"100%",maxWidth:480,maxHeight:"92vh",overflowY:"auto"}}>
            <div style={{fontWeight:800,fontSize:17,marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>☀️ Monat eintragen</span>
              <button onClick={()=>setShowForm(false)} style={{background:"none",border:"none",color:S.muted,cursor:"pointer",fontSize:22}}>✕</button>
            </div>
            <div style={{color:S.muted,fontSize:12,marginBottom:20}}>Felder mit <span style={{color:S.accent}}>*</span> sind Pflichtfelder</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
              <div>
                <label style={{color:S.muted,fontSize:11,fontWeight:600,display:"block",marginBottom:4,textTransform:"uppercase"}}>Monat *</label>
                <select value={form.monat} onChange={e=>setForm(f=>({...f,monat:Number(e.target.value)}))} style={{width:"100%",background:S.card,border:`1px solid ${S.border}`,borderRadius:6,padding:"9px 10px",color:S.text,fontSize:14,boxSizing:"border-box"}}>
                  {MONAT_LANG.slice(1).map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
              <Field label="Jahr" value={form.jahr} onChange={sf("jahr")} required/>
            </div>
            <div style={{background:S.bg,border:`1px solid ${S.border}`,borderRadius:10,padding:16,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                <span style={{fontSize:18}}>🔌</span>
                <div>
                  <div style={{fontWeight:700,fontSize:13}}>Stromzähler ablesen</div>
                  <div style={{color:S.muted,fontSize:11}}>Vormonat: Verbrauch {lastRaw.zaehler_ende} · Einspeisung {lastRaw.einsp_ende}</div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <Field label="Verbrauchszähler" value={form.zaehlerEnde} onChange={sf("zaehlerEnde")} placeholder={`> ${lastRaw.zaehler_ende}`} error={errors.zaehlerEnde} required/>
                <Field label="Einspeisezähler"  value={form.einspEnde}   onChange={sf("einspEnde")}   placeholder={`≥ ${lastRaw.einsp_ende}`}   error={errors.einspEnde}   required/>
              </div>
              {preview&&(
                <div style={{marginTop:10,display:"flex",flexWrap:"wrap",gap:"6px 20px",fontSize:12}}>
                  <span style={{color:S.muted}}>Netzverbrauch: <strong style={{color:S.text}}>{preview.verbrauch.toFixed(0)} kWh</strong></span>
                  <span style={{color:S.muted}}>Eingespeist: <strong style={{color:S.blue}}>{preview.eingespeist.toFixed(0)} kWh</strong></span>
                  <span style={{color:S.muted}}>Kosten: <strong style={{color:S.red}}>{preview.stromkosten.toFixed(2)} €</strong></span>
                </div>
              )}
            </div>
            <div style={{background:S.bg,border:`1px solid ${S.border}`,borderRadius:10,padding:16,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                <span style={{fontSize:18}}>📱</span>
                <div><div style={{fontWeight:700,fontSize:13}}>Anker SOLIX App</div><div style={{color:S.muted,fontSize:11}}>Monatswerte aus der App</div></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <Field label="Produziert (kWh)"   value={form.produziert}  step="0.01" onChange={sf("produziert")}  error={errors.produziert} required/>
                <div/>
                <Field label="Ins Haus (kWh)"      value={form.insHaus}     step="0.01" onChange={sf("insHaus")}     error={errors.insHaus}    required/>
                <Field label="Zum Speicher (kWh)" value={form.zumSpeicher} step="0.01" onChange={sf("zumSpeicher")}/>
              </div>
              {(form.insHaus||form.zumSpeicher)&&(
                <div style={{marginTop:10,fontSize:12,color:S.muted}}>
                  Einsatz Zh.: <strong style={{color:S.accent}}>{(Number(form.insHaus||0)+Number(form.zumSpeicher||0)).toFixed(2)} kWh</strong>
                </div>
              )}
            </div>
            <div style={{background:S.bg,border:`1px solid ${S.border}`,borderRadius:10,marginBottom:14,overflow:"hidden"}}>
              <button onClick={()=>setSpOpen(o=>!o)} style={{width:"100%",background:"none",border:"none",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:S.text}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:18}}>💶</span>
                  <div style={{textAlign:"left"}}>
                    <div style={{fontWeight:700,fontSize:13}}>Strompreis</div>
                    <div style={{color:S.muted,fontSize:11}}>{form.strompreis} €/kWh · nur ändern bei Preisänderung</div>
                  </div>
                </div>
                <span style={{color:S.muted,fontSize:12}}>{spOpen?"▲":"▼"}</span>
              </button>
              {spOpen&&<div style={{padding:"0 16px 16px"}}><Field label="€ pro kWh" value={form.strompreis} step="0.0001" onChange={sf("strompreis")} error={errors.strompreis} required/></div>}
            </div>
            <div style={{marginBottom:14}}>
              <label style={{color:S.muted,fontSize:11,fontWeight:600,display:"block",marginBottom:4,textTransform:"uppercase"}}>Kommentar (optional)</label>
              <input type="text" value={form.kommentar} placeholder="z.B. Urlaub, Preisänderung..." onChange={e=>setForm(f=>({...f,kommentar:e.target.value}))} style={{width:"100%",background:S.card,border:`1px solid ${S.border}`,borderRadius:6,padding:"9px 10px",color:S.text,fontSize:13,boxSizing:"border-box"}}/>
            </div>
            {preview&&(
              <div style={{background:`${S.green}15`,border:`1px solid ${S.green}40`,borderRadius:10,padding:14,marginBottom:16}}>
                <div style={{color:S.green,fontWeight:700,fontSize:11,marginBottom:10,textTransform:"uppercase",letterSpacing:0.5}}>✓ Berechnete Werte</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                  {[["Einsatz Zh.",`${preview.einsatzZuhause.toFixed(1)} kWh`,S.accent],["Gespart",fmtEur(preview.gespart),S.green],["Autarkie",fmtPct(preview.autarkie),S.blue],["EV-Quote",fmtPct(preview.evQ),S.blue],["Eingespeist",`${preview.eingespeist.toFixed(0)} kWh`,S.muted],["Stromkosten",fmtEur(preview.stromkosten),S.red]].map(([l,v,c])=>(
                    <div key={l}><div style={{color:S.muted,fontSize:10,textTransform:"uppercase",marginBottom:2}}>{l}</div><div style={{color:c,fontWeight:700,fontSize:15}}>{v}</div></div>
                  ))}
                </div>
              </div>
            )}
            {Object.keys(errors).length>0&&<div style={{background:`${S.red}18`,border:`1px solid ${S.red}50`,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:S.red}}>Bitte alle Pflichtfelder korrekt ausfüllen.</div>}
            <button onClick={handleAdd} style={{width:"100%",background:S.accent,color:"#000",border:"none",borderRadius:8,padding:"13px",fontWeight:800,cursor:"pointer",fontSize:14}}>Monat speichern</button>
          </div>
        </div>
      )}

      {/* ── DELETE ── */}
      {delConfirm&&(
        <div style={{position:"fixed",inset:0,background:"#00000090",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16}}>
          <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:28,maxWidth:360,width:"100%",textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:12}}>🗑️</div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>{delConfirm.label} löschen?</div>
            <div style={{color:S.muted,fontSize:13,marginBottom:24}}>Wird dauerhaft aus der Datenbank gelöscht.</div>
            <div style={{display:"flex",gap:12}}>
              <button onClick={()=>setDelConfirm(null)} style={{flex:1,background:"none",border:`1px solid ${S.border}`,color:S.text,borderRadius:8,padding:"10px",fontWeight:600,cursor:"pointer"}}>Abbrechen</button>
              <button onClick={()=>handleDelete(delConfirm.id,delConfirm.label)} style={{flex:1,background:S.red,color:"#000",border:"none",borderRadius:8,padding:"10px",fontWeight:700,cursor:"pointer"}}>Löschen</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
    </div>
  );
}
