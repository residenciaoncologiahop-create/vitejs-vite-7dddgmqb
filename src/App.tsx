import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Plus, ChevronRight, ArrowLeft,
  Sparkles, Loader2, X, Trash2, ShieldCheck,
  Activity, FileText, FileUp
} from 'lucide-react';

/* ================= CONFIGURACIÓN GEMINI ================= */

const MODEL_ID = 'gemini-1.5-flash';
const API_KEY = import.meta.env.VITE_GEMINI_KEY;

/* ================= CONTEXTO NCCN ================= */

const NCCN_GUIDELINES_TEXT = `
REFERENCIA: GUÍAS NCCN 2025.
- Colon: FOLFOX / CAPOX
- Recto: TNT
- Pulmón: Inmunoterapia si PD-L1 ≥1%
- Mama: Endocrino ± CDK4/6
`;

/* ================= APP ================= */

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
  const [aiMode, setAiMode] = useState('general');

  /* ================= PERSISTENCIA ================= */

  useEffect(() => {
    const saved = localStorage.getItem('oncoflow_data');
    if (saved) setPatients(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('oncoflow_data', JSON.stringify(patients));
  }, [patients]);

  /* ================= GEMINI CORE ================= */

  const callGemini = async (prompt, systemPrompt) => {
    if (!API_KEY) throw new Error('API KEY no configurada');

    const url = `https://generativelanguage.googleapis.com/v1/models/${MODEL_ID}:generateContent?key=${API_KEY}`;

    const payload = {
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'user', parts: [{ text: prompt }] }
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
      throw new Error(err.error?.message || 'Error Gemini');
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  };

  /* ================= PDF ================= */

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
      text += content.items.map(i => i.str).join(' ') + '\n';
    }
    return text;
  };

  /* ================= IMPORTAR PDF ================= */

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setIsImporting(true);
      setImportStatus('Leyendo PDF...');
      const text = await extractTextFromPDF(file);

      const prompt = `
Extrae la información clínica COMPLETA.
Formato JSON ESTRICTO:
{
  "name": "",
  "diagnosis": "",
  "clinicalNotes": "",
  "timeline": [
    { "date": "YYYY-MM-DD", "type": "Consulta", "note": "" }
  ]
}
Texto:
${text}
`;

      const json = await callGemini(prompt, 'Eres auditor médico.');
      const data = JSON.parse(json);

      setPatients([
        { id: Date.now(), ...data },
        ...patients
      ]);

      alert('✅ Paciente importado');
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setIsImporting(false);
      setImportStatus('');
      fileInputRef.current.value = '';
    }
  };

  /* ================= IA ================= */

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

  /* ================= UI ================= */

  const filtered = patients.filter(p =>
    p.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-md mx-auto h-screen bg-slate-50">
      {activeTab === 'dashboard' && (
        <div className="p-4 space-y-4">
          <header className="flex justify-between items-center">
            <h1 className="font-bold text-xl">OncoFlow</h1>
            <button
              onClick={() => fileInputRef.current.click()}
              className="bg-slate-900 text-white px-3 py-2 rounded-lg text-sm"
            >
              {isImporting ? importStatus : 'Subir PDF'}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf"
              onChange={handleFileUpload}
            />
          </header>

          <input
            className="w-full p-3 rounded-xl border"
            placeholder="Buscar paciente..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />

          {filtered.map(p => (
            <div
              key={p.id}
              className="bg-white p-4 rounded-xl shadow flex justify-between cursor-pointer"
              onClick={() => {
                setSelectedPatient(p);
                setActiveTab('detail');
              }}
            >
              <div>
                <h3 className="font-bold">{p.name}</h3>
                <p className="text-xs text-slate-500">{p.diagnosis}</p>
              </div>
              <ChevronRight />
            </div>
          ))}
        </div>
      )}

      {activeTab === 'detail' && selectedPatient && (
        <div className="p-4 space-y-4">
          <button
            onClick={() => setActiveTab('dashboard')}
            className="flex gap-2 text-sm"
          >
            <ArrowLeft /> Volver
          </button>

          <h2 className="text-xl font-bold">{selectedPatient.name}</h2>
          <p className="text-sm">{selectedPatient.diagnosis}</p>

          <div className="flex gap-2">
            <button
              onClick={() =>
                consultAI(
                  `Audita este caso:\n${selectedPatient.clinicalNotes}`,
                  `Guías NCCN:\n${NCCN_GUIDELINES_TEXT}`
                )
              }
              className="flex-1 bg-indigo-600 text-white p-2 rounded-lg"
            >
              NCCN
            </button>

            <button
              onClick={() =>
                consultAI(
                  `Redacta historia clínica formal:\n${JSON.stringify(selectedPatient.timeline)}`,
                  'Eres médico redactor.'
                )
              }
              className="flex-1 bg-emerald-600 text-white p-2 rounded-lg"
            >
              Resumen
            </button>
          </div>

          <button
            onClick={() =>
              confirm('¿Eliminar paciente?') &&
              setPatients(patients.filter(p => p.id !== selectedPatient.id)) &&
              setActiveTab('dashboard')
            }
            className="text-red-500 text-sm"
          >
            Eliminar
          </button>
        </div>
      )}

      {showAiModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-xl p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold flex gap-2">
                <Sparkles /> IA
              </h3>
              <button onClick={() => setShowAiModal(false)}>
                <X />
              </button>
            </div>
            {aiLoading ? (
              <Loader2 className="animate-spin mx-auto" />
            ) : (
              <pre className="whitespace-pre-wrap text-sm">{aiResult}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
