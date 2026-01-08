import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Plus, ChevronRight, ArrowLeft,
  Sparkles, Loader2, X, Trash2, ShieldCheck,
  Activity, FileText, FileUp
} from 'lucide-react';

/* ================= CONFIGURACIÓN DEFINITIVA ================= */

// Versión estable y compatible para Argentina y Hospitales Públicos
const MODEL_NAME = 'gemini-1.5-flash'; 

// INTERVENCIÓN: Pegue su clave aquí abajo
const API_KEY = "AIzaSyA6pACtF4j_FhNxWF2RDfT1LiRGNGuDa6Q"; 

/* ================= CONTEXTO ONCOLÓGICO ================= */

const NCCN_CONTEXT = `
REFERENCIA: GUÍAS NCCN 2025.
- Ca. Colon/Recto: Esquemas FOLFOX, CAPOX, TNT.
- Ca. Pulmón: PD-L1, Terapias dirigidas, Inmunoterapia.
- Ca. Mama: Clasificación molecular, CDK4/6.
`;

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const fileInputRef = useRef(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [showAiModal, setShowAiModal] = useState(false);

  // Persistencia Local (No requiere nube/tarjeta)
  useEffect(() => {
    const saved = localStorage.getItem('oncoflow_v3_data');
    if (saved) setPatients(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('oncoflow_v3_data', JSON.stringify(patients));
  }, [patients]);

  /* ================= COMUNICACIÓN CON GEMINI ================= */

  const callGemini = async (prompt, systemInstruction) => {
    if (!API_KEY || API_KEY.includes("PEGAR_AQUI")) {
      throw new Error('API KEY no detectada. Por favor péguela en el código.');
    }

    // URL ESTÁNDAR PARA GEMINI 1.5 FLASH
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

    const payload = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      generationConfig: {
        temperature: 0.1, // Baja temperatura para mayor precisión médica
        responseMimeType: "text/plain"
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(errorBody.error?.message || 'Fallo en la comunicación con la IA');
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  };

  /* ================= EXTRACCIÓN PDF ================= */

  const extractText = async (file) => {
    if (!window.pdfjsLib) {
      await new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = resolve;
        document.head.appendChild(script);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n';
    }
    return fullText;
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setIsImporting(true);
      setImportStatus('Leyendo PDF...');
      const text = await extractText(file);
      
      setImportStatus('Analizando Datos...');
      const prompt = `Analiza este texto médico y extrae: Nombre, Diagnóstico y una Cronología de eventos. Responde ÚNICAMENTE con un objeto JSON: {"name":"", "diagnosis":"", "notes":"", "timeline":[{"date":"YYYY-MM-DD", "type":"Consulta", "note":""}]}. Texto: ${text}`;
      
      const rawResponse = await callGemini(prompt, "Eres un asistente de oncología clínica. Solo respondes en formato JSON puro.");
      const cleanJson = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      const patientData = JSON.parse(cleanJson);

      setPatients([{ id: Date.now(), ...patientData }, ...patients]);
      alert("✅ Paciente cargado con éxito.");
    } catch (err) {
      console.error(err);
      alert("Error en la importación: " + err.message);
    } finally {
      setIsImporting(false);
      setImportStatus('');
    }
  };

  /* ================= INTERFAZ ================= */

  const filtered = patients.filter(p => p.name?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      
      {activeTab === 'dashboard' && (
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          <header className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm">
            <div>
              <h1 className="font-black text-2xl text-blue-900 italic">OncoFlow</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Residencia Hospitalaria</p>
            </div>
            <button 
              onClick={() => fileInputRef.current.click()}
              className="bg-blue-600 text-white p-3 rounded-xl shadow-lg active:scale-95 transition-all flex items-center gap-2 text-xs font-bold"
            >
              {isImporting ? <Loader2 className="animate-spin" size={16}/> : <FileUp size={16}/>}
              {isImporting ? importStatus : 'Importar HC'}
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept=".pdf" onChange={handleUpload} />
          </header>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            <input 
              className="w-full pl-12 pr-4 py-3 rounded-2xl border-none shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
              placeholder="Buscar por apellido..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            {filtered.map(p => (
              <div 
                key={p.id}
                className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex justify-between items-center cursor-pointer hover:border-blue-300 transition-all"
                onClick={() => { setSelectedPatient(p); setActiveTab('detail'); }}
              >
                <div>
                  <h3 className="font-bold text-slate-800">{p.name || "Sin nombre"}</h3>
                  <p className="text-[10px] font-black text-blue-500 uppercase mt-1 tracking-tighter">{p.diagnosis || "Sin diagnóstico"}</p>
                </div>
                <ChevronRight className="text-slate-200" />
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-20 opacity-30 italic text-sm">No hay pacientes registrados.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'detail' && selectedPatient && (
        <div className="flex flex-col h-full">
          <div className="bg-blue-900 text-white p-6 pt-10 rounded-b-[40px] shadow-2xl">
            <button onClick={() => setActiveTab('dashboard')} className="flex items-center gap-2 text-xs font-bold opacity-60 mb-4 uppercase tracking-widest">
              <ArrowLeft size={16}/> Volver
            </button>
            <h2 className="text-2xl font-black leading-tight">{selectedPatient.name}</h2>
            <p className="text-xs font-medium text-blue-300 mt-1 uppercase">{selectedPatient.diagnosis}</p>
            
            <div className="flex gap-2 mt-8">
              <button 
                onClick={() => {
                  setAiResult('');
                  setShowAiModal(true);
                  callGemini(`Audita este caso clínico según NCCN: ${JSON.stringify(selectedPatient)}`, NCCN_CONTEXT)
                    .then(res => setAiResult(res))
                    .catch(err => setAiResult("Error: " + err.message));
                }}
                className="flex-1 bg-white/10 hover:bg-white/20 p-3 rounded-2xl text-[10px] font-black uppercase flex items-center justify-center gap-2 backdrop-blur-md transition-all"
              >
                <ShieldCheck size={14}/> Guías NCCN
              </button>
              <button 
                onClick={() => {
                  setAiResult('');
                  setShowAiModal(true);
                  callGemini(`Redacta una historia clínica formal resumida basada en estos datos: ${JSON.stringify(selectedPatient.timeline)}`, "Eres un médico especialista redactando un informe profesional.")
                    .then(res => setAiResult(res))
                    .catch(err => setAiResult("Error: " + err.message));
                }}
                className="flex-1 bg-blue-500 p-3 rounded-2xl text-[10px] font-black uppercase flex items-center justify-center gap-2 shadow-lg transition-all"
              >
                <FileText size={14}/> Resumen Médico
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[3px] mb-4">Cronología</h3>
            <div className="space-y-4 border-l-2 border-slate-100 ml-2 pl-6">
              {selectedPatient.timeline?.map((ev, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-blue-500 border-4 border-white shadow-sm"></div>
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-50">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase">{ev.type}</span>
                      <span className="text-[10px] font-bold text-blue-600">{ev.date}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">{ev.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showAiModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end">
          <div className="bg-white w-full h-[85vh] rounded-t-[40px] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 duration-500">
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="font-black text-slate-800 flex items-center gap-2 tracking-tighter">
                <Sparkles size={20} className="text-purple-600"/> ANÁLISIS ONCOLÓGICO
              </h3>
              <button onClick={() => setShowAiModal(false)} className="bg-slate-100 p-2 rounded-full"><X size={20}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
              {aiResult === '' ? (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <Loader2 className="animate-spin text-blue-600" size={40}/>
                  <p className="text-[10px] font-black text-slate-400 uppercase animate-pulse">Consultando a Gemini...</p>
                </div>
              ) : (
                <div className="prose prose-slate max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed font-medium">
                    {aiResult}
                  </pre>
                </div>
              )}
            </div>
            <div className="p-6 bg-white border-t">
              <button onClick={() => setShowAiModal(false)} className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl">Cerrar Análisis</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
