import { useState, useMemo, useEffect, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, LineChart, Line, ReferenceLine,
  ComposedChart,
} from "recharts";

// ── SUPABASE CONFIG ─────────────────────────────────────────────────────────
const SUPABASE_URL = "https://viwhladpfxcboyerjsrq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpd2hsYWRwZnhjYm95ZXJqc3JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODAyOTAsImV4cCI6MjEwMTg1NjI5MH0.4u8boOijltxkJoMBj6WP7uF72wdDJCuBFV1kI-RkQw4";
const TABLE = "bkw_monate";

async function sbFetch(path, options={}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...(options.headers||{}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function loadAll() {
  return sbFetch(`${TABLE}?select=*&order=jahr.asc,monat.asc`);
}

async function insertRow(row) {
  return sbFetch(TABLE, { method:"POST", body: JSON.stringify(row) });
}

async function deleteRow(id) {
  return sbFetch(`${TABLE}?id=eq.${id}`, { method:"DELETE", prefer:"" });
}

// ── SEED DATA ──────────────────────────────────────────────────────────────
const SEED = [
  // ins_haus = Einsatz Zuhause (Spalte K), eigenverbrauch = Spalte L, gespart = eigenverbrauch × strompreis
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

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const INVESTITION_NETTO = 2043.95;
const CO2_FAKTOR = 0.380;
const SONNENSTUNDEN = { 1:52,2:75,3:120,4:165,5:200,6:215,7:225,8:210,9:155,10:105,11:55,12:42 };
const MONAT_NAMEN = ["","Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
const MONAT_LANG  = ["","Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

// ── BERECHNUNG ─────────────────────────────────────────────────────────────
function berechne(row) {
  const verbrauch      = row.zaehler_ende - row.zaehler_start;
  const eingespeist    = row.einsp_ende   - row.einsp_start;
  const einsatzZuhause = Number(row.ins_haus) + Number(row.zum_speicher||0);
  const eigenverbrauch = einsatzZuhause - eingespeist;               // EV = Einsatz Zuhause − Eingespeist
  const evQuote        = row.produziert>0 ? eigenverbrauch/row.produziert : 0;
  const gesamt         = verbrauch + einsatzZuhause;
  const autarkie       = gesamt>0 ? einsatzZuhause/gesamt : 0;
  const gespart        = eigenverbrauch * row.strompreis;             // Gespart = EV × Strompreis
  const stromkosten    = verbrauch * row.strompreis;
  const nettoKosten    = stromkosten - gespart;
  const co2            = einsatzZuhause * CO2_FAKTOR;
  const sonnenstunden  = SONNENSTUNDEN[row.monat]||0;
  const ertragProSonne = sonnenstunden>0 ? row.produziert/sonnenstunden : 0;
  return { ...row, verbrauch, eingespeist, einsatzZuhause, evQuote, gesamt, autarkie, gespart, stromkosten, nettoKosten, co2, sonnenstunden, ertragProSonne };
}

function breakEvenDate(data, inv) {
  let k=0;
  for (const r of data) {
    k+=r.gespart;
    if(k>=inv) return `${MONAT_LANG[r.monat]} ${r.jahr}`;
  }
  const avg=data.reduce((s,r)=>s+r.gespart,0)/data.length;
  const noch=inv-k;
  const monate=Math.ceil(noch/avg);
  const last=data[data.length-1];
  let m=last.monat, j=last.jahr;
  for(let i=0;i<monate;i++){m++;if(m>12){m=1;j++;}}
  return `${MONAT_LANG[m]} ${j}`;
}

// ── CSV EXPORT ─────────────────────────────────────────────────────────────
function exportCSV(data) {
  const headers = ["Monat","Jahr","Netzverbrauch_kWh","Produziert_kWh","Einsatz_Zuhause_kWh",
    "Ins_Haus_kWh","Zum_Speicher_kWh","Eingespeist_kWh","EV_Quote_%","Autarkie_%",
    "Gespart_EUR","Stromkosten_EUR","Netto_Kosten_EUR","CO2_kg","Sonnenstunden_h",
    "Ertrag_pro_Sonnenstunde","Strompreis_EUR_kWh","Kommentar"];
  const rows = data.map(r=>[
    MONAT_NAMEN[r.monat], r.jahr,
    r.verbrauch.toFixed(2), r.produziert.toFixed(2), r.einsatzZuhause.toFixed(2),
    r.ins_haus.toFixed(2), (r.zum_speicher||0).toFixed(2), r.eingespeist.toFixed(2),
    (r.evQuote*100).toFixed(1), (r.autarkie*100).toFixed(1),
    r.gespart.toFixed(2), r.stromkosten.toFixed(2), r.nettoKosten.toFixed(2),
    r.co2.toFixed(2), r.sonnenstunden,
    r.ertragProSonne.toFixed(4), r.strompreis.toFixed(4),
    `"${r.kommentar||""}"`
  ]);
  const csv = [headers.join(";"), ...rows.map(r=>r.join(";"))].join("\n");
  const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8;"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href=url; a.download=`balkonkraftwerk_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ── DESIGN ─────────────────────────────────────────────────────────────────
const S = {
  bg:"#0f172a",card:"#1e293b",card2:"#273449",border:"#334155",
  accent:"#f59e0b",green:"#34d399",blue:"#60a5fa",red:"#f87171",
  purple:"#a78bfa",text:"#f1f5f9",muted:"#94a3b8",
};

const TIPS = {
  "EV-Quote":"Anteil der produzierten Energie der selbst genutzt wurde (inkl. Speicher)",
  "Autarkie":"Anteil des Gesamtverbrauchs der durch Solar gedeckt wurde",
  "Netto-Stromkosten":"Stromkosten (Netz) minus Ersparnis durch Solar — was du wirklich zahlst",
  "Ertrag/Sonnenstunde":"kWh Produktion pro Sonnenstunde — Effizienzindikator der Anlage",
};

function InfoTip({term}){
  const [show,setShow]=useState(false);
  if(!TIPS[term]) return null;
  return(
    <span style={{position:"relative",display:"inline-block",marginLeft:4}}>
      <span onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}
        style={{color:S.muted,cursor:"help",fontSize:11,border:`1px solid ${S.border}`,borderRadius:"50%",
          width:14,height:14,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>?</span>
      {show&&<div style={{position:"absolute",bottom:"120%",left:"50%",transform:"translateX(-50%)",
        background:S.card2,border:`1px solid ${S.border}`,borderRadius:8,padding:"8px 12px",
        fontSize:11,color:S.text,width:220,zIndex:200,lineHeight:1.5,whiteSpace:"normal"}}>{TIPS[term]}</div>}
    </span>
  );
}

const CTT = ({active,payload,label})=>{
  if(!active||!payload?.length) return null;
  return(
    <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:8,padding:"10px 14px",fontSize:13}}>
      <p style={{color:S.muted,marginBottom:6,fontWeight:600}}>{label}</p>
      {payload.map((p,i)=><p key={i} style={{color:p.color,margin:"2px 0"}}>{p.name}: <strong>{typeof p.value==="number"?p.value.toFixed(2):p.value}</strong></p>)}
    </div>
  );
};

function Field({label,value,onChange,type="number",step="1",placeholder="",error,required}){
  return(
    <div>
      <label style={{color:error?S.red:S.muted,fontSize:11,fontWeight:600,display:"block",marginBottom:4,textTransform:"uppercase"}}>
        {label}{required&&<span style={{color:S.accent}}> *</span>}
      </label>
      <input type={type} step={step} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{width:"100%",background:S.card,border:`1px solid ${error?S.red:S.border}`,
          borderRadius:6,padding:"9px 10px",color:S.text,fontSize:14,boxSizing:"border-box"}}/>
      {error&&<div style={{color:S.red,fontSize:11,marginTop:3}}>{error}</div>}
    </div>
  );
}

function Toast({msg,type="success",onClose}){
  const bg = type==="error" ? S.red : S.green;
  return(
    <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:bg,
      color:"#000",borderRadius:10,padding:"12px 24px",fontWeight:700,fontSize:14,zIndex:300,
      boxShadow:"0 4px 20px #0006",display:"flex",alignItems:"center",gap:10}}>
      {type==="success"?"✓":"⚠"} {msg}
      <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#000"}}>✕</button>
    </div>
  );
}

function KpiCard({label,value,sub,color,icon,tip}){
  return(
    <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{color:S.muted,fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,display:"flex",alignItems:"center"}}>
          {label}{tip&&<InfoTip term={tip}/>}
        </div>
        <span style={{fontSize:20}}>{icon}</span>
      </div>
      <div style={{fontSize:26,fontWeight:800,color,margin:"8px 0 4px",letterSpacing:-1}}>{value}</div>
      <div style={{color:S.muted,fontSize:12}}>{sub}</div>
    </div>
  );
}

function fmt(n,dec=1){return typeof n==="number"?n.toFixed(dec):"–";}
function fmtPct(n){return typeof n==="number"?(n*100).toFixed(1)+"%":"–";}
function fmtEur(n){return typeof n==="number"?n.toFixed(2)+" €":"–";}

// ── APP ────────────────────────────────────────────────────────────────────
export default function App(){
  const [rows,    setRows]    = useState([]);
  const [status,  setStatus]  = useState("loading"); // loading | ready | error
  const [activeTab,setActiveTab]=useState("dashboard");
  const [showForm,setShowForm]=useState(false);
  const [seeding, setSeeding] =useState(false);
  const [errors,  setErrors]  =useState({});
  const [toast,   setToast]   =useState(null);
  const [spOpen,  setSpOpen]  =useState(false);
  const [delConfirm,setDelConfirm]=useState(null);

  const showToast=(msg,type="success")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  // ── LOAD ──
  const load = useCallback(async()=>{
    setStatus("loading");
    try {
      const data = await loadAll();
      setRows(data||[]);
      setStatus("ready");
    } catch(e){
      setStatus("error");
      showToast("Verbindung zu Supabase fehlgeschlagen","error");
    }
  },[]);

  useEffect(()=>{ load(); },[load]);

  // ── SEED ──
  async function handleSeed(){
    setSeeding(true);
    try {
      for(const row of SEED){
        await insertRow(row);
      }
      await load();
      showToast("11 Monate erfolgreich importiert ✓");
    } catch(e){
      showToast("Fehler beim Import: "+e.message,"error");
    }
    setSeeding(false);
  }

  // ── FORM DEFAULT ──
  const lastRaw = rows.length>0 ? rows[rows.length-1] : SEED[SEED.length-1];
  const nextM = ()=>{ let m=lastRaw.monat+1,j=lastRaw.jahr; if(m>12){m=1;j++;} return {monat:m,jahr:j}; };
  const [form,setForm]=useState(()=>({ ...nextM(), zaehlerEnde:"", einspEnde:"", produziert:"", insHaus:"", zumSpeicher:"", strompreis:"0.2871", kommentar:"" }));
  const sf=k=>v=>setForm(f=>({...f,[k]:v}));

  useEffect(()=>{
    if(rows.length>0){
      const last=rows[rows.length-1];
      let m=last.monat+1,j=last.jahr; if(m>12){m=1;j++;}
      setForm(f=>({...f,monat:m,jahr:j,strompreis:last.strompreis.toString()}));
    }
  },[rows]);

  // ── COMPUTED ──
  const data = useMemo(()=>rows.map(berechne),[rows]);

  const preview = useMemo(()=>{
    const z=Number(form.zaehlerEnde),e=Number(form.einspEnde);
    const ih=Number(form.insHaus),zs=Number(form.zumSpeicher)||0,sp=Number(form.strompreis);
    if(!z||!e||!ih||!sp) return null;
    const verbrauch=z-lastRaw.zaehler_ende, eingespeist=e-lastRaw.einsp_ende;
    const einsatzZuhause=ih+zs;
    const ev=einsatzZuhause-eingespeist;
    const gespart=ev*sp;
    const stromkosten=verbrauch*sp, gesamt=verbrauch+einsatzZuhause;
    return { verbrauch, eingespeist, einsatzZuhause, gespart, stromkosten,
             nettoKosten:stromkosten-gespart, autarkie:gesamt>0?einsatzZuhause/gesamt:0,
             evQ:Number(form.produziert)>0?ev/Number(form.produziert):0 };
  },[form,lastRaw]);

  const totals=useMemo(()=>{
    if(!data.length) return null;
    const gespart    =data.reduce((s,r)=>s+r.gespart,0);
    const prod       =data.reduce((s,r)=>s+r.produziert,0);
    const ev         =data.reduce((s,r)=>s+r.einsatzZuhause,0);
    const einsp      =data.reduce((s,r)=>s+r.eingespeist,0);
    const stromk     =data.reduce((s,r)=>s+r.stromkosten,0);
    const co2        =data.reduce((s,r)=>s+r.co2,0);
    const avgAut     =data.reduce((s,r)=>s+r.autarkie,0)/data.length;
    const noch       =INVESTITION_NETTO-gespart;
    const avgPm      =gespart/data.length;
    const bestMonat  =data.reduce((b,r)=>r.gespart>b.gespart?r:b,data[0]);
    const last3      =data.slice(-3);
    const rolling3   =last3.reduce((s,r)=>s+r.gespart,0)/last3.length;
    return { gespart,prod,ev,einsp,stromk,co2,avgAut,noch,avgPm,bestMonat,rolling3,jahresprognose:avgPm*12 };
  },[data]);

  const amortData=useMemo(()=>{ let k=0; return data.map(r=>({name:`${MONAT_NAMEN[r.monat]} ${r.jahr}`,kumulativ:+(k+=r.gespart).toFixed(2)})); },[data]);
  const chartData=data.map(r=>({...r,monat:MONAT_NAMEN[r.monat]}));
  const momChange=data.length>=2?((data[data.length-1].gespart-data[data.length-2].gespart)/data[data.length-2].gespart)*100:null;

  // ── VALIDATE & SAVE ──
  function validate(){
    const e={};
    const z=Number(form.zaehlerEnde),zP=lastRaw.zaehler_ende;
    const ei=Number(form.einspEnde),eP=lastRaw.einsp_ende;
    if(!form.zaehlerEnde) e.zaehlerEnde="Pflichtfeld";
    else if(z<=zP) e.zaehlerEnde=`Muss > ${zP} sein`;
    if(!form.einspEnde) e.einspEnde="Pflichtfeld";
    else if(ei<eP) e.einspEnde=`Muss ≥ ${eP} sein`;
    if(!form.produziert) e.produziert="Pflichtfeld";
    if(!form.insHaus)    e.insHaus="Pflichtfeld";
    if(!form.strompreis) e.strompreis="Pflichtfeld";
    return e;
  }

  async function handleAdd(){
    const errs=validate(); if(Object.keys(errs).length){setErrors(errs);return;}
    const newRow={
      jahr:Number(form.jahr), monat:Number(form.monat),
      zaehler_start:lastRaw.zaehler_ende, zaehler_ende:Number(form.zaehlerEnde),
      einsp_start:lastRaw.einsp_ende,     einsp_ende:Number(form.einspEnde),
      produziert:Number(form.produziert), ins_haus:Number(form.insHaus),
      zum_speicher:Number(form.zumSpeicher)||0,
      strompreis:Number(form.strompreis), kommentar:form.kommentar,
    };
    try {
      await insertRow(newRow);
      await load();
      setErrors({}); setShowForm(false);
      showToast(`${MONAT_NAMEN[form.monat]} ${form.jahr} gespeichert`);
    } catch(e){ showToast("Fehler beim Speichern: "+e.message,"error"); }
  }

  async function handleDelete(id,label){
    try {
      await deleteRow(id);
      await load();
      setDelConfirm(null);
      showToast(`${label} gelöscht`);
    } catch(e){ showToast("Fehler beim Löschen","error"); }
  }

  const tabs=[
    {id:"dashboard",label:"Übersicht"},
    {id:"analyse",  label:"Analyse"},
    {id:"amort",    label:"Amortisation"},
    {id:"daten",    label:"Monatsdaten"},
  ];

  // ── RESPONSIVE ──
  const [isMobile, setIsMobile] = useState(()=>window.innerWidth < 768);
  useEffect(()=>{
    const fn = ()=>setIsMobile(window.innerWidth<768);
    window.addEventListener("resize",fn);
    return ()=>window.removeEventListener("resize",fn);
  },[]);

  // ── LOADING STATE ──
  if(status==="loading") return(
    <div style={{background:S.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:S.muted,fontSize:16}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:16}}>☀️</div>
        <div>Lade Daten…</div>
      </div>
    </div>
  );

  // ── EMPTY STATE (first use) ──
  if(status==="ready" && rows.length===0) return(
    <div style={{background:S.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:S.text,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{textAlign:"center",maxWidth:400,padding:32}}>
        <div style={{fontSize:64,marginBottom:16}}>☀️</div>
        <div style={{fontSize:22,fontWeight:800,marginBottom:8}}>Balkonkraftwerk Tracker</div>
        <div style={{color:S.muted,marginBottom:32}}>Datenbank ist leer. Historische Daten aus der Excel importieren?</div>
        <button onClick={handleSeed} disabled={seeding}
          style={{background:S.accent,color:"#000",border:"none",borderRadius:10,padding:"14px 28px",fontWeight:800,fontSize:16,cursor:"pointer",width:"100%",marginBottom:12}}>
          {seeding?"Importiere…":"📥 Historische Daten importieren (Sep 2025 – Jul 2026)"}
        </button>
        <button onClick={()=>{ setRows([]); setStatus("ready-empty"); setShowForm(true); }}
          style={{background:"none",border:`1px solid ${S.border}`,color:S.muted,borderRadius:10,padding:"12px 28px",fontWeight:600,fontSize:14,cursor:"pointer",width:"100%"}}>
          Leer starten
        </button>
      </div>
    </div>
  );

  // ── MOBILE VIEW ──
  if(isMobile && data.length>0) {
    const last = data[data.length-1];
    const amortPct = Math.min(100,(totals?.gespart||0)/INVESTITION_NETTO*100);
    return(
      <div style={{background:S.bg,minHeight:"100vh",color:S.text,fontFamily:"'Inter',system-ui,sans-serif",padding:20,maxWidth:480,margin:"0 auto"}}>
        {/* Mobile Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:28}}>☀️</span>
            <div>
              <div style={{fontWeight:800,fontSize:17}}>BKW Tracker</div>
              <div style={{color:S.muted,fontSize:11}}>{rows.length} Monate · {rows.length} Einträge</div>
            </div>
          </div>
          <button onClick={()=>{setShowForm(true);setErrors({});}}
            style={{background:S.accent,color:"#000",border:"none",borderRadius:10,padding:"10px 16px",fontWeight:800,fontSize:14,cursor:"pointer"}}>
            + Eintragen
          </button>
        </div>

        {/* Letzter Monat Snapshot */}
        <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:16,padding:20,marginBottom:16}}>
          <div style={{color:S.muted,fontSize:11,fontWeight:600,textTransform:"uppercase",marginBottom:12}}>
            Letzter Monat — {MONAT_NAMEN[last.monat]} {last.jahr}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
            {[
              ["⚡","Produziert",`${last.produziert.toFixed(1)} kWh`,S.accent],
              ["💰","Gespart",fmtEur(last.gespart),S.green],
              ["🏠","Autarkie",fmtPct(last.autarkie),S.blue],
            ].map(([icon,label,value,color])=>(
              <div key={label} style={{textAlign:"center"}}>
                <div style={{fontSize:22,marginBottom:4}}>{icon}</div>
                <div style={{color,fontWeight:800,fontSize:18}}>{value}</div>
                <div style={{color:S.muted,fontSize:10,textTransform:"uppercase"}}>{label}</div>
              </div>
            ))}
          </div>
          {last.kommentar&&(
            <div style={{background:S.bg,borderRadius:8,padding:"8px 12px",fontSize:12,color:S.muted}}>
              💬 {last.kommentar}
            </div>
          )}
        </div>

        {/* Amortisation */}
        <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:16,padding:20,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontWeight:700,fontSize:14}}>Amortisation</span>
            <span style={{color:S.accent,fontWeight:700,fontSize:14}}>{amortPct.toFixed(1)}%</span>
          </div>
          <div style={{background:S.border,borderRadius:99,height:10,overflow:"hidden",marginBottom:8}}>
            <div style={{background:`linear-gradient(90deg,${S.accent},${S.green})`,height:"100%",borderRadius:99,width:`${amortPct.toFixed(1)}%`}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:S.muted}}>
            <span>{fmtEur(totals?.gespart||0)} gespart</span>
            <span>Break-even: <strong style={{color:S.accent}}>{breakEvenDate(data,INVESTITION_NETTO)}</strong></span>
          </div>
        </div>

        {/* Gesamt KPIs */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          {[
            ["Gesamt gespart",fmtEur(totals?.gespart||0),S.green],
            ["Produziert",`${fmt(totals?.prod||0)} kWh`,S.accent],
            ["Ø Autarkie",fmtPct(totals?.avgAut||0),S.blue],
            ["CO₂ gespart",`${fmt((totals?.co2||0)/1000,2)} t`,S.green],
          ].map(([label,value,color])=>(
            <div key={label} style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:16}}>
              <div style={{color:S.muted,fontSize:10,textTransform:"uppercase",marginBottom:6}}>{label}</div>
              <div style={{color,fontWeight:800,fontSize:20}}>{value}</div>
            </div>
          ))}
        </div>

        {/* Letzten 3 Monate */}
        <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:16,padding:16}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Letzte 3 Monate</div>
          {[...data].reverse().slice(0,3).map((r,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<2?`1px solid ${S.border}20`:"none"}}>
              <span style={{fontWeight:600,fontSize:13}}>{MONAT_NAMEN[r.monat]} {r.jahr}</span>
              <div style={{display:"flex",gap:16,fontSize:13}}>
                <span style={{color:S.accent}}>{fmt(r.produziert)} kWh</span>
                <span style={{color:S.green,fontWeight:700}}>{fmtEur(r.gespart)}</span>
                <span style={{color:S.blue}}>{fmtPct(r.autarkie)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Modal + Toast */}
        {showForm&&(
          <div style={{position:"fixed",inset:0,background:"#00000090",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:"16px 16px 0 0",padding:24,width:"100%",maxHeight:"92vh",overflowY:"auto"}}>
              <div style={{fontWeight:800,fontSize:17,marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>☀️ Monat eintragen</span>
                <button onClick={()=>setShowForm(false)} style={{background:"none",border:"none",color:S.muted,cursor:"pointer",fontSize:22}}>✕</button>
              </div>
              <div style={{color:S.muted,fontSize:12,marginBottom:20}}>Felder mit <span style={{color:S.accent}}>*</span> sind Pflichtfelder</div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                <div>
                  <label style={{color:S.muted,fontSize:11,fontWeight:600,display:"block",marginBottom:4,textTransform:"uppercase"}}>Monat *</label>
                  <select value={form.monat} onChange={e=>setForm(f=>({...f,monat:Number(e.target.value)}))}
                    style={{width:"100%",background:S.card,border:`1px solid ${S.border}`,borderRadius:6,padding:"9px 10px",color:S.text,fontSize:14,boxSizing:"border-box"}}>
                    {MONAT_LANG.slice(1).map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <Field label="Jahr" value={form.jahr} onChange={k=>setForm(f=>({...f,jahr:k}))} required/>
              </div>

              <div style={{background:S.bg,border:`1px solid ${S.border}`,borderRadius:10,padding:14,marginBottom:12}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>🔌 Zähler — Vormonat: {lastRaw.zaehler_ende} / {lastRaw.einsp_ende}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <Field label="Verbrauch" value={form.zaehlerEnde} onChange={k=>setForm(f=>({...f,zaehlerEnde:k}))} placeholder={`> ${lastRaw.zaehler_ende}`} error={errors.zaehlerEnde} required/>
                  <Field label="Einspeisung" value={form.einspEnde} onChange={k=>setForm(f=>({...f,einspEnde:k}))} placeholder={`≥ ${lastRaw.einsp_ende}`} error={errors.einspEnde} required/>
                </div>
              </div>

              <div style={{background:S.bg,border:`1px solid ${S.border}`,borderRadius:10,padding:14,marginBottom:12}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>📱 Anker SOLIX App</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <Field label="Produziert (kWh)" value={form.produziert} step="0.01" onChange={k=>setForm(f=>({...f,produziert:k}))} error={errors.produziert} required/>
                  <Field label="Ins Haus (kWh)" value={form.insHaus} step="0.01" onChange={k=>setForm(f=>({...f,insHaus:k}))} error={errors.insHaus} required/>
                  <Field label="Zum Speicher (kWh)" value={form.zumSpeicher} step="0.01" onChange={k=>setForm(f=>({...f,zumSpeicher:k}))}/>
                  <div/>
                </div>
              </div>

              <div style={{marginBottom:12}}>
                <label style={{color:S.muted,fontSize:11,fontWeight:600,display:"block",marginBottom:4,textTransform:"uppercase"}}>Kommentar</label>
                <input type="text" value={form.kommentar} placeholder="z.B. Urlaub..."
                  onChange={e=>setForm(f=>({...f,kommentar:e.target.value}))}
                  style={{width:"100%",background:S.card,border:`1px solid ${S.border}`,borderRadius:6,padding:"9px 10px",color:S.text,fontSize:13,boxSizing:"border-box"}}/>
              </div>

              {preview&&(
                <div style={{background:`${S.green}15`,border:`1px solid ${S.green}40`,borderRadius:10,padding:12,marginBottom:14}}>
                  <div style={{color:S.green,fontWeight:700,fontSize:11,marginBottom:8,textTransform:"uppercase"}}>✓ Berechnet</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    {[["Gespart",`${preview.gespart.toFixed(2)} €`,S.green],["Autarkie",fmtPct(preview.autarkie),S.blue],["EV-Quote",fmtPct(preview.evQ),S.blue]].map(([l,v,c])=>(
                      <div key={l}><div style={{color:S.muted,fontSize:10,textTransform:"uppercase"}}>{l}</div><div style={{color:c,fontWeight:700,fontSize:15}}>{v}</div></div>
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(errors).length>0&&(
                <div style={{background:`${S.red}18`,border:`1px solid ${S.red}50`,borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:12,color:S.red}}>
                  Bitte alle Pflichtfelder ausfüllen.
                </div>
              )}

              <button onClick={handleAdd}
                style={{width:"100%",background:S.accent,color:"#000",border:"none",borderRadius:10,padding:"14px",fontWeight:800,cursor:"pointer",fontSize:15}}>
                Monat speichern
              </button>
            </div>
          </div>
        )}
        {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      </div>
    );
  }

  return(
    <div style={{background:S.bg,minHeight:"100vh",color:S.text,fontFamily:"'Inter',system-ui,sans-serif",fontSize:14}}>

      {/* HEADER */}
      <div style={{background:S.card,borderBottom:`1px solid ${S.border}`,padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:26}}>☀️</span>
          <div>
            <div style={{fontWeight:700,fontSize:17,letterSpacing:-0.3}}>Balkonkraftwerk Tracker</div>
            <div style={{color:S.muted,fontSize:11}}>1700 W · 1,6 kWh Speicher · {rows.length} Monate gespeichert</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          {data.length>0&&(
            <button onClick={()=>exportCSV(data)}
              style={{background:"none",border:`1px solid ${S.border}`,color:S.muted,borderRadius:8,padding:"8px 14px",fontWeight:600,cursor:"pointer",fontSize:12}}>
              ↓ CSV
            </button>
          )}
          <button onClick={()=>{setShowForm(true);setErrors({});}}
            style={{background:S.accent,color:"#000",border:"none",borderRadius:8,padding:"9px 16px",fontWeight:700,cursor:"pointer",fontSize:13}}>
            + Monat eintragen
          </button>
        </div>
      </div>

      {/* TABS */}
      <div style={{background:S.card,borderBottom:`1px solid ${S.border}`,padding:"0 24px",display:"flex",overflowX:"auto"}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            style={{background:"none",border:"none",borderBottom:activeTab===t.id?`2px solid ${S.accent}`:"2px solid transparent",
              color:activeTab===t.id?S.accent:S.muted,padding:"12px 16px",cursor:"pointer",fontWeight:600,fontSize:13,whiteSpace:"nowrap"}}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{padding:24,maxWidth:1100,margin:"0 auto"}}>

        {/* ── ÜBERSICHT ── */}
        {activeTab==="dashboard"&&totals&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16,marginBottom:24}}>
              <KpiCard label="Gesamt gespart"    value={fmtEur(totals.gespart)}   sub={`Ø ${fmtEur(totals.avgPm)}/Monat`}               color={S.green}  icon="💰"/>

              <KpiCard label="CO₂ gespart"       value={`${(totals.co2/1000).toFixed(2)} t`} sub={`${fmt(totals.co2)} kg gesamt`}       color={S.green}  icon="🌱"/>
              <KpiCard label="Ø Autarkie"        value={fmtPct(totals.avgAut)}    sub="Solar-Anteil am Gesamtverbrauch"                  color={S.blue}   icon="🏠" tip="Autarkie"/>
            </div>

            {/* Amort */}
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20,marginBottom:24}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{fontWeight:700}}>Amortisationsfortschritt</span>
                <span style={{color:S.muted,fontSize:13}}>{fmtEur(totals.gespart)} von {fmtEur(INVESTITION_NETTO)}</span>
              </div>
              <div style={{background:S.border,borderRadius:99,height:12,overflow:"hidden"}}>
                <div style={{background:`linear-gradient(90deg,${S.accent},${S.green})`,height:"100%",borderRadius:99,
                  width:`${Math.min(100,(totals.gespart/INVESTITION_NETTO)*100).toFixed(1)}%`,transition:"width 0.6s"}}/>
              </div>
              <div style={{color:S.muted,fontSize:12,marginTop:6,display:"flex",justifyContent:"space-between"}}>
                <span>{((totals.gespart/INVESTITION_NETTO)*100).toFixed(1)}% amortisiert</span>
                <span>Break-even: <strong style={{color:S.accent}}>{breakEvenDate(data,INVESTITION_NETTO)}</strong></span>
              </div>
            </div>

            {/* Heatmap */}
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20,marginBottom:24}}>
              <div style={{fontWeight:700,marginBottom:4}}>Jahres-Heatmap</div>
              <div style={{color:S.muted,fontSize:11,marginBottom:14}}>Produktion pro Monat — dunkler = mehr Sonne</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6}}>
                {(() => {
                  const maxProd = Math.max(...data.map(r=>r.produziert));
                  const allMonths = Array.from({length:12},(_,i)=>i+1).map(m=>{
                    const r = data.find(d=>d.monat===m);
                    return { monat:m, row:r||null };
                  });
                  return allMonths.map(({monat,row})=>{
                    const intensity = row ? row.produziert/maxProd : 0;
                    const bg = row
                      ? `rgba(245,158,11,${0.15 + intensity*0.85})`
                      : S.border;
                    return(
                      <div key={monat} style={{background:bg,borderRadius:8,padding:"10px 6px",textAlign:"center",
                        border:`1px solid ${row?`rgba(245,158,11,${0.3+intensity*0.5})`:S.border}`}}>
                        <div style={{fontSize:11,fontWeight:600,color:row?(intensity>0.5?"#000":S.text):S.muted}}>
                          {MONAT_NAMEN[monat]}
                        </div>
                        {row&&<div style={{fontSize:10,color:row?(intensity>0.5?"#000":S.muted):S.muted,marginTop:2}}>
                          {row.produziert.toFixed(0)} kWh
                        </div>}
                        {!row&&<div style={{fontSize:10,color:S.border,marginTop:2}}>–</div>}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Highlights */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16,marginBottom:24}}>
              {[
                {icon:"🏆",label:"Bester Monat",value:`${MONAT_NAMEN[totals.bestMonat.monat]} ${totals.bestMonat.jahr}`,sub:`${fmtEur(totals.bestMonat.gespart)} · ${fmt(totals.bestMonat.produziert)} kWh`,color:S.accent},
                {icon:"📈",label:"Trend (3-Monats-Ø)",value:fmtEur(totals.rolling3),sub:momChange!==null?`${momChange>=0?"+":""}${momChange.toFixed(1)}% ggü. Vormonat`:"",color:S.blue},
              ].map((k,i)=>(
                <div key={i} style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:16}}>
                  <div style={{color:S.muted,fontSize:11,fontWeight:600,textTransform:"uppercase",marginBottom:8}}>{k.icon} {k.label}</div>
                  <div style={{fontSize:20,fontWeight:800,color:k.color}}>{k.value}</div>
                  <div style={{color:S.muted,fontSize:12,marginTop:4}}>{k.sub}</div>
                </div>
              ))}
            </div>



          </div>
        )}

        {/* ── ANALYSE ── */}
        {activeTab==="analyse"&&totals&&(
          <div style={{display:"flex",flexDirection:"column",gap:24}}>
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
              <div style={{fontWeight:700,marginBottom:4}}>☀️ Sonnenstunden vs. Produktion</div>
              <div style={{color:S.muted,fontSize:11,marginBottom:16}}>Klimamittelwerte Frankfurt/Rhein-Main</div>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={chartData} margin={{top:0,right:20,left:-10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                  <XAxis dataKey="monat" stroke={S.muted} tick={{fontSize:12}}/>
                  <YAxis yAxisId="left"  stroke={S.muted} tick={{fontSize:12}}/>
                  <YAxis yAxisId="right" orientation="right" stroke={S.accent} tick={{fontSize:12,fill:S.accent}}/>
                  <Tooltip content={<CTT/>}/>
                  <Legend wrapperStyle={{color:S.muted,fontSize:12}}/>
                  <Bar   yAxisId="left"  dataKey="sonnenstunden" name="Sonnenstunden (h)" fill={S.accent} opacity={0.4} radius={[4,4,0,0]}/>
                  <Line  yAxisId="right" type="monotone" dataKey="produziert" name="Produziert (kWh)" stroke={S.accent} strokeWidth={2.5} dot={{r:4,fill:S.accent}}/>
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
              <div style={{fontWeight:700,marginBottom:4,display:"flex",alignItems:"center",gap:4}}>Effizienz — Ertrag/Sonnenstunde<InfoTip term="Ertrag/Sonnenstunde"/></div>
              <div style={{color:S.muted,fontSize:11,marginBottom:16}}>kWh ÷ Sonnenstunden — Konstanz zeigt stabile Anlagenleistung</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{top:0,right:10,left:-10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                  <XAxis dataKey="monat" stroke={S.muted} tick={{fontSize:12}}/>
                  <YAxis stroke={S.muted} tick={{fontSize:12}} tickFormatter={v=>`${v.toFixed(2)}`}/>
                  <Tooltip content={<CTT/>} formatter={v=>[v.toFixed(3)+" kWh/h"]}/>
                  <Bar dataKey="ertragProSonne" name="kWh/Sonnenstunde" fill={S.purple} radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
              <div style={{fontWeight:700,marginBottom:4}}>🌱 CO₂-Ersparnis kumuliert</div>
              <div style={{color:S.muted,fontSize:11,marginBottom:16}}>Basis: {CO2_FAKTOR} kg CO₂/kWh (Bundesschnitt 2024)</div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={(()=>{let k=0;return chartData.map(r=>({monat:r.monat,kum:+(k+=r.co2).toFixed(1)}));})()}
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
                {[["Gesamt",`${fmt(totals.co2)} kg`],["= Autofahrt",`${fmt(totals.co2/0.12)} km`],["Prognose/Jahr",`${fmt((totals.co2/data.length)*12)} kg`]].map(([l,v])=>(
                  <div key={l}><div style={{color:S.muted,fontSize:11,textTransform:"uppercase"}}>{l}</div><div style={{color:S.green,fontWeight:700,fontSize:18}}>{v}</div></div>
                ))}
              </div>
            </div>

            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
              <div style={{fontWeight:700,marginBottom:16}}>📅 Prognosen & Kennzahlen</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:16}}>
                {[
                  {label:"Hochrechnung/Jahr",value:fmtEur(totals.jahresprognose),sub:"Ø aller Monate × 12",color:S.green},
                  {label:"Break-even",value:breakEvenDate(data,INVESTITION_NETTO),sub:"voraussichtliches Datum",color:S.accent},
                  {label:"3-Monats-Ø",value:fmtEur(totals.rolling3),sub:"letzte 3 Monate",color:S.blue},
                ].map((k,i)=>(
                  <div key={i} style={{background:S.bg,borderRadius:10,padding:16}}>
                    <div style={{color:S.muted,fontSize:11,fontWeight:600,textTransform:"uppercase",marginBottom:6}}>{k.label}</div>
                    <div style={{fontSize:20,fontWeight:800,color:k.color}}>{k.value}</div>
                    <div style={{color:S.muted,fontSize:11,marginTop:4}}>{k.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          <div style={{borderTop:"1px solid #334155",margin:"8px 0 24px"}}/>
          <div style={{fontWeight:700,fontSize:15,marginBottom:16,color:S.text}}>Diagramme</div>
          <div style={{display:"flex",flexDirection:"column",gap:24}}>
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
              <div style={{fontWeight:700,marginBottom:16}}>Produktion, Einsatz Zuhause & Einspeisung (kWh)</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{top:0,right:10,left:-10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/><XAxis dataKey="monat" stroke={S.muted} tick={{fontSize:12}}/><YAxis stroke={S.muted} tick={{fontSize:12}}/>
                  <Tooltip content={<CTT/>}/><Legend wrapperStyle={{color:S.muted,fontSize:12}}/>
                  <Bar dataKey="produziert"     name="Produziert"      fill={S.accent} radius={[4,4,0,0]}/>
                  <Bar dataKey="einsatzZuhause" name="Einsatz Zuhause" fill={S.green}  radius={[4,4,0,0]}/>
                  <Bar dataKey="eingespeist"    name="Eingespeist"     fill={S.blue}   radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
              <div style={{fontWeight:700,marginBottom:16}}>Ersparnis vs. Stromkosten (€)</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{top:0,right:10,left:-10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/><XAxis dataKey="monat" stroke={S.muted} tick={{fontSize:12}}/><YAxis stroke={S.muted} tick={{fontSize:12}} tickFormatter={v=>`${v.toFixed(0)} €`}/>
                  <Tooltip content={<CTT/>} formatter={v=>[v.toFixed(2)+" €"]}/><Legend wrapperStyle={{color:S.muted,fontSize:12}}/>
                  <Bar dataKey="gespart"     name="Gespart (Solar)"    fill={S.green} radius={[4,4,0,0]}/>
                  <Bar dataKey="stromkosten" name="Stromkosten (Netz)" fill={S.red}   radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:20}}>
              <div style={{fontWeight:700,marginBottom:12,display:"flex",alignItems:"center",gap:4}}>Autarkie & EV-Quote (%)<InfoTip term="Autarkie"/><InfoTip term="EV-Quote"/></div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{top:0,right:10,left:-10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/><XAxis dataKey="monat" stroke={S.muted} tick={{fontSize:12}}/><YAxis stroke={S.muted} tick={{fontSize:12}} tickFormatter={v=>`${(v*100).toFixed(0)}%`}/>
                  <Tooltip content={<CTT/>} formatter={v=>[(v*100).toFixed(1)+"%"]}/><Legend wrapperStyle={{color:S.muted,fontSize:12}}/>
                  <Line type="monotone" dataKey="autarkie" name="Autarkie" stroke={S.green}  strokeWidth={2.5} dot={{r:4,fill:S.green}}/>
                  <Line type="monotone" dataKey="evQuote"  name="EV-Quote" stroke={S.accent} strokeWidth={2.5} dot={{r:4,fill:S.accent}}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          </div>
        )}

        {/* ── AMORTISATION ── */}
        {activeTab==="amort"&&totals&&(
          <div style={{display:"flex",flexDirection:"column",gap:24}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16}}>
              {[
                {label:"Investition netto", value:fmtEur(INVESTITION_NETTO),       color:S.red,   sub:"nach Zuschüssen"},
                {label:"Bisher gespart",    value:fmtEur(totals.gespart),           color:S.green, sub:`über ${data.length} Monate`},
                {label:"Noch offen",        value:fmtEur(Math.max(0,totals.noch)),  color:S.accent,sub:"bis Break-even"},
                {label:"Break-even",        value:breakEvenDate(data,INVESTITION_NETTO),color:S.blue,sub:"voraussichtliches Datum"},
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
                  {[["1. Solarpanel (Jul 2022)","702,00 €",false],["2–4 Solarpanel + Speicher (Sep 2025)","891,02 €",false],
                    ["Speichererweiterung (Feb 2026)","384,00 €",false],["Material","150,00 €",false],
                    ["Montage Smartmeter","291,93 €",false],["Brutto gesamt","2.418,95 €",true],
                    ["– Zuschuss Maintal","−300,00 €",false],["– Ersparnis 1. Panel (3 J. × 25 €)","−75,00 €",false],
                  ].map(([l,v,b],i)=>(
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
              <button onClick={()=>exportCSV(data)}
                style={{background:"none",border:`1px solid ${S.border}`,color:S.muted,borderRadius:8,padding:"7px 14px",fontWeight:600,cursor:"pointer",fontSize:12}}>
                ↓ CSV exportieren
              </button>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,whiteSpace:"nowrap"}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${S.border}`,color:S.muted}}>
                  {[["Monat"],["Netzverbr."],["Produziert"],["Einsatz Zh."],["Ins Haus"],["Eingespeist"],["EV-Quote","EV-Quote"],["Autarkie","Autarkie"],["Gespart"],["Netto-K.","Netto-Stromkosten"],["CO₂"],["☀ h"],["kWh/☀h","Ertrag/Sonnenstunde"],["Kommentar"],[""]].map(([h,tip])=>(
                    <th key={h} style={{padding:"6px 10px",textAlign:"left",fontWeight:600}}>{h}{tip&&<InfoTip term={tip}/>}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((r,i)=>(
                  <tr key={i} style={{borderBottom:`1px solid ${S.border}20`}}>
                    <td style={{padding:"8px 10px",fontWeight:700}}>{MONAT_NAMEN[r.monat]} {r.jahr}</td>
                    <td style={{padding:"8px 10px"}}>{fmt(r.verbrauch)} kWh</td>
                    <td style={{padding:"8px 10px",color:S.accent}}>{fmt(r.produziert)} kWh</td>
                    <td style={{padding:"8px 10px",color:S.green,fontWeight:600}}>{fmt(r.einsatzZuhause)} kWh</td>
                    <td style={{padding:"8px 10px",color:S.muted}}>{fmt(r.ins_haus)} kWh</td>
                    <td style={{padding:"8px 10px",color:S.blue}}>{fmt(r.eingespeist,0)} kWh</td>
                    <td style={{padding:"8px 10px"}}>{fmtPct(r.evQuote)}</td>
                    <td style={{padding:"8px 10px"}}>{fmtPct(r.autarkie)}</td>
                    <td style={{padding:"8px 10px",color:S.green,fontWeight:700}}>{fmtEur(r.gespart)}</td>
                    <td style={{padding:"8px 10px",color:r.nettoKosten<0?S.green:S.red}}>{fmtEur(r.nettoKosten)}</td>
                    <td style={{padding:"8px 10px",color:S.green}}>{fmt(r.co2,1)} kg</td>
                    <td style={{padding:"8px 10px",color:S.accent}}>{r.sonnenstunden}h</td>
                    <td style={{padding:"8px 10px",color:S.purple}}>{fmt(r.ertragProSonne,3)}</td>
                    <td style={{padding:"8px 10px",color:S.muted,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis"}}>{r.kommentar||"–"}</td>
                    <td style={{padding:"8px 10px"}}>
                      <button onClick={()=>setDelConfirm({id:r.id,label:`${MONAT_NAMEN[r.monat]} ${r.jahr}`})}
                        style={{background:"none",border:`1px solid ${S.border}`,color:S.red,borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:11}}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{borderTop:`2px solid ${S.border}`,fontWeight:800}}>
                  <td style={{padding:"10px 10px"}}>GESAMT</td>
                  <td style={{padding:"10px 10px"}}>{fmt(data.reduce((s,r)=>s+r.verbrauch,0))} kWh</td>
                  <td style={{padding:"10px 10px",color:S.accent}}>{totals&&fmt(totals.prod)} kWh</td>
                  <td style={{padding:"10px 10px",color:S.green}}>{totals&&fmt(totals.ev)} kWh</td>
                  <td/><td style={{padding:"10px 10px",color:S.blue}}>{totals&&fmt(totals.einsp,0)} kWh</td>
                  <td colSpan={2} style={{padding:"10px 10px"}}>{totals&&fmtPct(totals.avgAut)} Ø</td>
                  <td style={{padding:"10px 10px",color:S.green}}>{totals&&fmtEur(totals.gespart)}</td>

                  <td style={{padding:"10px 10px",color:S.green}}>{totals&&fmt(totals.co2,1)} kg</td>
                  <td colSpan={4}/>
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
                <label style={{color:S.muted,fontSize:11,fontWeight:600,display:"block",marginBottom:4,textTransform:"uppercase"}}>Monat <span style={{color:S.accent}}>*</span></label>
                <select value={form.monat} onChange={e=>setForm(f=>({...f,monat:Number(e.target.value)}))}
                  style={{width:"100%",background:S.card,border:`1px solid ${S.border}`,borderRadius:6,padding:"9px 10px",color:S.text,fontSize:14,boxSizing:"border-box"}}>
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
              <button onClick={()=>setSpOpen(o=>!o)}
                style={{width:"100%",background:"none",border:"none",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:S.text}}>
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
              <input type="text" value={form.kommentar} placeholder="z.B. Urlaub, Preisänderung..."
                onChange={e=>setForm(f=>({...f,kommentar:e.target.value}))}
                style={{width:"100%",background:S.card,border:`1px solid ${S.border}`,borderRadius:6,padding:"9px 10px",color:S.text,fontSize:13,boxSizing:"border-box"}}/>
            </div>

            {preview&&(
              <div style={{background:`${S.green}15`,border:`1px solid ${S.green}40`,borderRadius:10,padding:14,marginBottom:16}}>
                <div style={{color:S.green,fontWeight:700,fontSize:11,marginBottom:10,textTransform:"uppercase",letterSpacing:0.5}}>✓ Berechnete Werte</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                  {[["Einsatz Zh.",`${preview.einsatzZuhause.toFixed(1)} kWh`,S.accent],["Gespart",`${preview.gespart.toFixed(2)} €`,S.green],
                    ["Netto-Kosten",`${preview.nettoKosten.toFixed(2)} €`,preview.nettoKosten<0?S.green:S.red],
                    ["Autarkie",fmtPct(preview.autarkie),S.blue],["EV-Quote",fmtPct(preview.evQ),S.blue],
                    ["Eingespeist",`${preview.eingespeist.toFixed(0)} kWh`,S.muted],
                  ].map(([l,v,c])=>(
                    <div key={l}><div style={{color:S.muted,fontSize:10,textTransform:"uppercase",marginBottom:2}}>{l}</div><div style={{color:c,fontWeight:700,fontSize:15}}>{v}</div></div>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(errors).length>0&&(
              <div style={{background:`${S.red}18`,border:`1px solid ${S.red}50`,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:S.red}}>
                Bitte alle Pflichtfelder korrekt ausfüllen.
              </div>
            )}

            <button onClick={handleAdd}
              style={{width:"100%",background:S.accent,color:"#000",border:"none",borderRadius:8,padding:"13px",fontWeight:800,cursor:"pointer",fontSize:14}}>
              Monat speichern
            </button>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM ── */}
      {delConfirm&&(
        <div style={{position:"fixed",inset:0,background:"#00000090",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16}}>
          <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:28,maxWidth:360,width:"100%",textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:12}}>🗑️</div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>{delConfirm.label} löschen?</div>
            <div style={{color:S.muted,fontSize:13,marginBottom:24}}>Dieser Eintrag wird dauerhaft aus der Datenbank gelöscht.</div>
            <div style={{display:"flex",gap:12}}>
              <button onClick={()=>setDelConfirm(null)}
                style={{flex:1,background:"none",border:`1px solid ${S.border}`,color:S.text,borderRadius:8,padding:"10px",fontWeight:600,cursor:"pointer"}}>Abbrechen</button>
              <button onClick={()=>handleDelete(delConfirm.id,delConfirm.label)}
                style={{flex:1,background:S.red,color:"#000",border:"none",borderRadius:8,padding:"10px",fontWeight:700,cursor:"pointer"}}>Löschen</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
    </div>
  );
}

