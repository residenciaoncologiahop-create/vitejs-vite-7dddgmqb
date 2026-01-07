import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Calendar,
  FileText,
  Search,
  Plus,
  ChevronRight,
  Clock,
  ArrowLeft,
  Filter,
  Sparkles,
  Loader2,
  MessageSquare,
  X,
  Save,
  Trash2,
  ShieldCheck,
  Activity,
  FileUp,
  AlertTriangle,
  ArrowDown,
} from 'lucide-react';

// --- GUÍAS NCCN (Contexto) ---
const NCCN_GUIDELINES_TEXT = `
REFERENCIA: GUÍAS NCCN 2025.
1. DIGESTIVOS: Ca. Anal (Nigro), Recto (TNT), Colon (FOLFOX), Páncreas (FOLFIRINOX).
2. PULMÓN: Inmunoterapia (Pembrolizumab) si PD-L1 >1% o 50%.
3. GINECOLOGÍA: Cérvix (Cisplatino + Pembro).
`;

const App = () => {
  // --- ESTADOS ---
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Estado para Importación Real
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const fileInputRef = useRef(null);

  // Cronología Manual
  const [newEvent, setNewEvent] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'Consulta',
    note: '',
  });
  const [showEventForm, setShowEventForm] = useState(false);

  // IA Modal
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiMode, setAiMode] = useState('general');

  // --- TU CLAVE AQUÍ ---
const apiKey = import.meta.env.VITE_GEMINI_KEY || "AIzaSyAzyv3Q0kWalCEubzQ85P8IAOCuJ2_tZ3w";

  // --- CARGA DE DATOS ---
  const [patients, setPatients] = useState(() => {
    const saved = localStorage.getItem('oncoflow_full_v1');
    if (saved) return JSON.parse(saved);
    return [];
  });

  useEffect(() => {
    localStorage.setItem('oncoflow_full_v1', JSON.stringify(patients));
  }, [patients]);

  // --- 🧠 CEREBRO: LLAMADA A GEMINI ---
  const callGeminiRaw = async (prompt, system) => {
    if (!apiKey) throw new Error('Falta API Key');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: { responseMimeType: 'application/json' },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Error en Gemini API');
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text;
  };

  // --- 👀 OJOS: EXTRACCIÓN DE TEXTO DEL PDF ---
  const extractTextFromPDF = async (file) => {
    if (!window.pdfjsLib) {
      setImportStatus('Cargando motor PDF...');
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    setImportStatus('Leyendo documento completo...');
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer })
      .promise;
    let fullText = '';

    // Leemos TODAS las páginas sin límite
    for (let i = 1; i <= pdf.numPages; i++) {
      setImportStatus(`Leyendo página ${i} de ${pdf.numPages}...`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(' ');
      fullText += ` --- PÁGINA ${i} --- \n ${pageText} \n`;
    }
    return fullText;
  };

  // --- PROCESO DE IMPORTACIÓN ---
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setIsImporting(true);

      // 1. Extraer texto COMPLETO (Sin recortes)
      const text = await extractTextFromPDF(file);

      setImportStatus('IA procesando historial completo...');

      // 2. Enviar a Gemini con instrucciones de NO RESUMIR eventos
      const prompt = `
        ANALIZA ESTA HISTORIA CLÍNICA COMPLETA.
        
        INSTRUCCIONES CRÍTICAS:
        1. NO RESUMAS LA CRONOLOGÍA. Necesito CADA evento detectado (Consultas, Quimioterapias, Estudios) desde el inicio hasta la fecha más reciente (2026).
        2. Extrae Nombre y Diagnóstico (o infiérelo por las drogas).
        3. Ordena los eventos del MÁS RECIENTE al MÁS ANTIGUO.
        
        TEXTO DEL PDF:
        ${text} 

        FORMATO JSON ESPERADO:
        {
          "name": "Apellido, Nombre",
          "diagnosis": "Diagnóstico Inferido",
          "stage": "Estadio (si figura)",
          "clinicalNotes": "Resumen breve del caso...",
          "timeline": [
            { "date": "YYYY-MM-DD", "type": "Quimioterapia/Consulta", "note": "Droga/Detalle..." }
          ]
        }
      `;

      const jsonString = await callGeminiRaw(
        prompt,
        'Eres un auditor médico experto. Extrae TODOS los eventos sin omitir ninguno.'
      );
      const patientData = JSON.parse(jsonString);

      const newPatient = {
        id: Date.now(),
        ...patientData,
        lastVisit:
          patientData.timeline?.[0]?.date ||
          new Date().toISOString().split('T')[0],
      };

      setPatients([newPatient, ...patients]);
      alert(
        `✅ ¡Importación completa!\nPaciente: ${
          newPatient.name
        }\nSe detectaron ${
          newPatient.timeline?.length || 0
        } eventos hasta la fecha ${newPatient.lastVisit}.`
      );
      setActiveTab('dashboard'); // Volver al dashboard para ver al nuevo paciente
    } catch (error) {
      console.error(error);
      alert('Error: ' + error.message);
    } finally {
      setIsImporting(false);
      setImportStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- LÓGICA GENERAL IA ---
  const callGeminiChat = async (prompt, sys) => {
    setAiLoading(true);
    setAiResult(null);
    setShowAiModal(true);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: {
          parts: [
            {
              text:
                sys + (aiMode === 'nccn' ? `\n${NCCN_GUIDELINES_TEXT}` : ''),
            },
          ],
        },
      };
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      setAiResult(data.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch (e) {
      setAiResult('Error al conectar.');
    } finally {
      setAiLoading(false);
    }
  };

  const consultNCCN = (p) => {
    setAiMode('nccn');
    callGeminiChat(
      `Audita este caso según NCCN:\nPaciente: ${p.name}\nDx: ${p.diagnosis}\nNotas: ${p.clinicalNotes}`,
      'Eres auditor médico.'
    );
  };

  const generateFullHistory = (p) => {
    setAiMode('general');
    const timelineTxt = p.timeline
      ? p.timeline.map((e) => `${e.date} (${e.type}): ${e.note}`).join('\n')
      : '';
    callGeminiChat(
      `Genera Historia Clínica Formal basada en esto:\n${timelineTxt}`,
      'Eres médico redactor.'
    );
  };

  const addTimelineEvent = () => {
    if (!selectedPatient || !newEvent.note) return;
    const updatedPatient = {
      ...selectedPatient,
      timeline: [newEvent, ...(selectedPatient.timeline || [])].sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      ),
    };
    setPatients(
      patients.map((p) => (p.id === selectedPatient.id ? updatedPatient : p))
    );
    setSelectedPatient(updatedPatient);
    setShowEventForm(false);
  };

  const deletePatient = (id) => {
    if (confirm('¿Eliminar?')) setPatients(patients.filter((p) => p.id !== id));
    setActiveTab('dashboard');
  };

  // --- VISTAS ---
  const Dashboard = () => {
    const filtered = patients.filter((p) =>
      p.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return (
      <div className="p-4 space-y-6 pb-24">
        <header className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <div>
            <h1 className="text-xl font-bold text-slate-800">OncoFlow</h1>
            <p className="text-slate-500 text-xs">Historial Completo</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current.click()}
              disabled={isImporting}
              className="bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-transform disabled:opacity-50"
            >
              {isImporting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileUp size={16} />
              )}
              {isImporting ? importStatus : 'Subir PDF'}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf"
              onChange={handleFileUpload}
            />
          </div>
        </header>
        <div className="relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            size={20}
          />
          <input
            type="text"
            placeholder="Buscar..."
            className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white border border-slate-200 outline-none shadow-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="text-center text-slate-400 py-10 text-sm">
              Sin pacientes. ¡Sube un PDF!
            </div>
          )}
          {filtered.map((p) => (
            <div
              key={p.id}
              onClick={() => {
                setSelectedPatient(p);
                setActiveTab('detail');
              }}
              className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between active:scale-95 transition-transform cursor-pointer"
            >
              <div className="flex gap-4 items-center">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  {p.name ? p.name.charAt(0) : '?'}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{p.name}</h3>
                  <p className="text-xs text-slate-500">{p.diagnosis}</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-slate-300" />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const PatientDetail = ({ p }) => (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header Fijo */}
      <div className="bg-slate-900 text-white p-6 pt-10 rounded-b-[2.5rem] shadow-xl z-20 shrink-0">
        <button
          onClick={() => setActiveTab('dashboard')}
          className="mb-4 flex items-center gap-2 text-slate-300"
        >
          <ArrowLeft size={20} /> Volver
        </button>
        <h2 className="text-2xl font-bold">{p.name}</h2>
        <div className="flex items-center gap-2 text-blue-200 text-sm mt-1">
          <Activity size={16} /> {p.diagnosis}
        </div>
        <div className="flex gap-2 mt-6">
          <button
            onClick={() => consultNCCN(p)}
            className="flex-1 bg-indigo-600 p-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg"
          >
            <ShieldCheck size={16} /> NCCN
          </button>
          <button
            onClick={() => generateFullHistory(p)}
            className="flex-1 bg-emerald-600 p-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg"
          >
            <FileText size={16} /> Resumen
          </button>
        </div>
      </div>

      {/* Contenedor Scrollable para Cronología */}
      <div className="flex-1 overflow-y-auto p-5 -mt-4 pt-8 z-10 scroll-smooth">
        <div className="flex justify-between items-center mb-4 px-1 sticky top-0 bg-slate-50/95 backdrop-blur-sm py-2 z-10">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            Cronología{' '}
            <span className="text-xs bg-slate-200 px-2 py-0.5 rounded-full text-slate-500">
              {p.timeline?.length || 0} eventos
            </span>
          </h3>
          <button
            onClick={() => setShowEventForm(!showEventForm)}
            className="text-blue-600 text-xs font-bold bg-blue-50 px-3 py-1.5 rounded-full flex items-center gap-1"
          >
            {showEventForm ? <X size={14} /> : <Plus size={14} />} Evolucionar
          </button>
        </div>

        {showEventForm && (
          <div className="bg-white p-4 rounded-2xl shadow-lg border border-blue-100 mb-6">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input
                type="date"
                className="bg-slate-50 p-2 rounded-lg text-sm"
                value={newEvent.date}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, date: e.target.value })
                }
              />
              <select
                className="bg-slate-50 p-2 rounded-lg text-sm"
                value={newEvent.type}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, type: e.target.value })
                }
              >
                <option>Consulta</option>
                <option>Quimioterapia</option>
                <option>Imágenes</option>
                <option>Cirugía</option>
              </select>
            </div>
            <textarea
              className="w-full bg-slate-50 p-3 rounded-lg text-sm h-20 mb-3"
              placeholder="Nota..."
              value={newEvent.note}
              onChange={(e) =>
                setNewEvent({ ...newEvent, note: e.target.value })
              }
            />
            <button
              onClick={addTimelineEvent}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold text-sm"
            >
              Guardar
            </button>
          </div>
        )}

        <div className="space-y-4 border-l-2 border-slate-200 ml-3 pl-6 pb-24 relative">
          {p.timeline?.map((event, idx) => (
            <div key={idx} className="relative group">
              <div
                className={`absolute -left-[31px] top-0 w-4 h-4 rounded-full border-2 border-white shadow-sm transition-all group-hover:scale-125 ${
                  event.type?.includes('Quim') ? 'bg-purple-500' : 'bg-blue-500'
                }`}
              />
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 group-hover:border-blue-200 transition-colors">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-slate-100 text-slate-600">
                    {event.type}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    {event.date}
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {event.note}
                </p>
              </div>
            </div>
          ))}

          {/* Indicador de fin de historial */}
          <div className="relative pt-4 opacity-50 text-center">
            <div className="absolute -left-[27px] top-5 w-2 h-2 rounded-full bg-slate-300" />
            <p className="text-xs text-slate-400">Inicio de Historia Clínica</p>
          </div>
        </div>

        <button
          onClick={() => deletePatient(p.id)}
          className="w-full mb-8 text-red-400 text-xs font-bold flex justify-center gap-2"
        >
          <Trash2 size={14} /> Borrar Historia
        </button>
      </div>
    </div>
  );

  const AiModal = () => (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity ${
        showAiModal ? 'visible opacity-100' : 'invisible opacity-0'
      }`}
    >
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-5">
        <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
          <h3 className="font-bold text-slate-800 flex gap-2">
            <Sparkles size={18} className="text-purple-600" /> Resultado IA
          </h3>
          <button onClick={() => setShowAiModal(false)}>
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
          {aiLoading ? (
            <div className="text-center py-10">
              <Loader2 className="animate-spin mx-auto text-blue-500 mb-2" />
              Procesando...
            </div>
          ) : (
            aiResult
          )}
        </div>
        {!aiLoading && (
          <div className="p-4 border-t bg-slate-50">
            <button
              onClick={() => setShowAiModal(false)}
              className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 font-sans flex flex-col shadow-2xl overflow-hidden relative">
      <main className="flex-1 overflow-hidden h-full">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'detail' && <PatientDetail p={selectedPatient} />}
      </main>
      <AiModal />
    </div>
  );
};

export default App;
