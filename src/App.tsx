import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Plus, ChevronRight, ArrowLeft,
  Sparkles, Loader2, X, Trash2, ShieldCheck,
  Activity, FileText, FileUp
} from 'lucide-react';

/* ================= CONFIGURACIÓN ================= */

const MODEL_ID = 'gemini-1.5-flash'; 

// Ponga su clave API real dentro de las comillas abajo
const API_KEY = "AIzaSyA6pACtF4j_FhNxWF2RDfT1LiRGNGuDa6Q"; 

/* ================= GUIAS ONCOLOGICAS ================= */

const NCCN_GUIDELINES_TEXT = `
REFERENCIA: GUÍAS NCCN 2025.
- Colon: FOLFOX / CAPOX
- Recto: TNT
- Pulmón: Inmunoterapia si PD-L1 ≥1%
- Mama: Endocrino ± CDK4/6
`;

/* ================= APP PRINCIPAL ================= */

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

  /* ================= GUARDADO AUTOMATICO ================= */

  useEffect(() => {
    const saved = localStorage.getItem('oncoflow_data');
    if (saved) setPatients(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('oncoflow_data', JSON.stringify(patients));
  }, [patients]);

  /* ================= CONEXION CON GEMINI ================= */

  const callGemini = async (prompt, systemPrompt) => {
    if (!API_KEY || API_KEY.includes("PEGAR_TU_CLAVE")) {
        throw new Error('Error: Falta configurar la API KEY en el código.');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${API_KEY}`;

    const payload = {
      contents: [
        { role: 'user', parts: [{ text: systemPrompt + "\n" + prompt }] }
      ],
      generationConfig: { temperature: 0.2 }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Error de conexión con Gemini');
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  };

  /* ================= MOTOR PDF ================= */

  const extractTextFromPDF = async (file) => {
    if (!window.pdfjsLib) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;

    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    return text;
  };

  /* ================= MANEJO DE ARCHIVOS ================= */

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setIsImporting(true);
      setImportStatus('Leyendo PDF...');
      const text = await extractTextFromPDF(file);
      
      setImportStatus('Analizando con IA...');

      const prompt = `
      Analiza este texto médico y extrae los datos.
      Responde SOLO con un JSON válido con este formato:
      {
        "name": "Nombre Paciente",
        "diagnosis": "Diagnóstico Principal",
        "clinicalNotes": "Resumen del caso",
        "timeline": [
          { "date": "YYYY-MM-DD", "type": "Consulta/Quimio/Imagen", "note": "Descripción breve" }
        ]
      }
      
      Texto del PDF:
      ${text}
      `;

      const jsonString = await callGemini(prompt, 'Eres un experto en oncología. Solo respondes JSON válido.');
      
      // Limpiamos el texto por si la IA agrega comillas de codigo extra
      const cleanJson = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
      
      let data;
      try {
        data = JSON.parse(cleanJson);
      } catch (parseError) {
        console.error("Error parseando JSON", parseError);
        throw new Error("La IA no devolvió un formato válido. Intente de nuevo.");
      }

      setPatients([
        { id: Date.now(), ...data },
        ...patients
      ]);

      alert('✅ Paciente importado correctamente.');
    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
    } finally {
      setIsImporting(false);
      setImportStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /* ================= CONSULTAS DE IA ================= */

  const consultAI = async (prompt, system) => {
    setAiLoading(true);
    setShowAiModal(true);
    try {
      const text = await callGemini(prompt, system);
      setAiResult(text);
    } catch (e) {
      setAiResult('Error: ' + e.message);
    } finally {
      setAiLoading(false);
    }
  };

  /* ================= INTERFAZ GRAFICA ================= */

  const filtered = patients.filter(p =>
    p.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 font-sans text-slate-900">
      
      {/* VISTA: DASHBOARD (LISTA) */}
      {activeTab === 'dashboard' && (
        <div className="p-4 space-y-4 pb-20">
          <header className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
            <div>
              <h1 className="font-black text-2xl text-slate-800">OncoFlow</h1>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Residentes</p>
            </div>
            <button
              onClick={() => fileInputRef.current.click()}
              className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-all hover:bg-slate-800"
            >
              {isImporting ? <Loader2 className="animate-spin" size={16}/> : <FileUp size={16}/>}
              {isImporting ? 'Procesando...' : 'Subir PDF'}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf"
              onChange={handleFileUpload}
            />
          </header>

          <div className="relative">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
             <input
              className="w-full pl-10 pr-4 py-3 rounded-xl border-none bg-white shadow-sm font-medium focus:ring-2 focus:ring-blue-100 outline-none transition-all"
              placeholder="Buscar paciente..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            {filtered.map(p => (
              <div
                key={p.id}
                className="bg-white p-5 rounded-2xl shadow-sm flex justify-between items-center cursor-pointer border border-slate-100 active:scale-95 transition-all hover:border-blue-200"
                onClick={() => {
                  setSelectedPatient(p);
                  setActiveTab('detail');
                }}
              >
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">{p.name || 'Paciente Sin Nombre'}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider">
                      {p.diagnosis || 'Diagnóstico Pendiente'}
                    </span>
                  </div>
                </div>
                <ChevronRight className="text-slate-300" />
              </div>
            ))}
             {filtered.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm bg-white rounded-2xl border border-dashed border-slate-200">
                    <p className="font-medium">No hay pacientes cargados.</p>
                    <p className="text-xs mt-1">Sube un PDF para comenzar.</p>
                </div>
             )}
          </div>
        </div>
      )}

      {/* VISTA: DETALLE PACIENTE */}
      {activeTab === 'detail' && selectedPatient && (
        <div className="flex flex-col h-screen bg-slate-50">
           <div className="bg-slate-900 text-white p-6 pt-8 rounded-b-[30px] shadow-xl z-10">
              <button
                onClick={() => setActiveTab('dashboard')}
                className="flex gap-2 text-sm font-bold text-slate-400 mb-4 items-center hover:text-white transition-colors"
              >
                <ArrowLeft size={18} /> Volver
              </button>

              <h2 className="text-2xl font-black leading-tight">{selectedPatient.name}</h2>
              <p className="text-sm text-blue-200 font-medium flex items-center gap-2 mt-2">
                <Activity size={14}/> {selectedPatient.diagnosis}
              </p>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() =>
                    consultAI(
                      `Audita este caso clínico:\n${selectedPatient.clinicalNotes}\nDiagnóstico: ${selectedPatient.diagnosis}`,
                      `Actúa como auditor médico oncológico. Usa estas guías si aplica:\n${NCCN_GUIDELINES_TEXT}`
                    )
                  }
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-xl text-xs font-bold flex justify-center gap-2 shadow-lg transition-all active:scale-95"
                >
                  <ShieldCheck size={16}/> Auditar NCCN
                </button>

                <button
                  onClick={() =>
                    consultAI(
                      `Redacta una evolución médica formal cronológica basada en estos eventos:\n${JSON.stringify(selectedPatient.timeline)}`,
                      'Eres un médico residente redactando una historia clínica oficial. Usa lenguaje técnico preciso.'
                    )
                  }
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-xl text-xs font-bold flex justify-center gap-2 shadow-lg transition-all active:scale-95"
                >
                  <FileText size={16}/> Resumen HC
                </button>
              </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
             <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Resumen Clínico</h3>
                <p className="text-sm text-slate-700 leading-relaxed font-medium">
                  {selectedPatient.clinicalNotes || "No se detectaron notas clínicas."}
                </p>
             </div>

            <div className="space-y-4 relative pl-4 border-l-2 border-slate-200 ml-2 pb-10">
                {selectedPatient.timeline?.map((event, idx) => (
                    <div key={idx} className="relative group">
                        <div className="absolute -left-[21px] top-1.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow-sm group-hover:scale-125 transition-all"></div>
                        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:border-blue-200 transition-colors">
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-[10px] font-black uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded tracking-wide">{event.type}</span>
                                <span className="text-xs font-bold text-slate-400">{event.date}</span>
                            </div>
                            <p className="text-sm text-slate-700 leading-relaxed">{event.note}</p>
                        </div>
                    </div>
                ))}
            </div>

            <button
              onClick={() =>
                confirm('¿Está seguro de eliminar este paciente?') &&
                setPatients(patients.filter(p => p.id !== selectedPatient.id)) &&
                setActiveTab('dashboard')
              }
              className="w-full mt-4 mb-8 text-red-400 text-xs font-bold flex justify-center gap-2 py-3 hover:text-red-600 transition-colors"
            >
              <Trash2 size={14}/> Eliminar Historia Clínica
            </button>
          </div>
        </div>
      )}

      {/* MODAL IA */}
      {showAiModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg h-[85vh] sm:h-auto rounded-t-3xl sm:rounded-3xl p-0 flex flex-col shadow-2xl animate-in slide-in-from-bottom-5">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50 rounded-t-3xl">
              <h3 className="font-black text-slate-800 flex gap-2 items-center">
                <Sparkles size={18} className="text-purple-600" /> Resultado IA
              </h3>
              <button onClick={() => setShowAiModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-white">
                {aiLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 py-10">
                    <Loader2 className="animate-spin text-purple-600" size={40} />
                    <p className="text-sm font-bold text-slate-400 animate-pulse">Analizando con Gemini...</p>
                </div>
                ) : (
                <pre className="whitespace-pre-wrap text-sm text-slate-700 font-medium leading-relaxed font-sans">
                    {aiResult}
                </pre>
                )}
            </div>
            
            <div className="p-4 border-t bg-slate-50">
                <button 
                    onClick={() => setShowAiModal(false)}
                    className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-colors"
                >
                    Cerrar
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
