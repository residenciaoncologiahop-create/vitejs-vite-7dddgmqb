import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Plus, ChevronRight, ArrowLeft,
  Sparkles, Loader2, X, Trash2, ShieldCheck,
  Activity, FileText, FileUp
} from 'lucide-react';

/* ================= CONFIGURACIÓN GEMINI (CORAZÓN DEL SISTEMA) ================= */

// Usamos el modelo 1.5 Flash que es más rápido y estable para PDFs
const MODEL_ID = 'gemini-1.5-flash'; 

// AQUÍ ES LA INTERVENCIÓN: PEGA TU CLAVE DENTRO DE LAS COMILLAS
const API_KEY = "AIzaSyA6pACtF4j_FhNxWF2RDfT1LiRGNGuDa6Q"; 

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
    // Validación de seguridad para que no falle silenciosamente
    if (!API_KEY || API_KEY.includes("PEGAR_TU_CLAVE")) {
        throw new Error('¡Falta pegar la API KEY en el código!');
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
      
      setImportStatus('Analizando con IA...');

      const prompt = `
Extrae la información clínica COMPLETA de este texto.
Formato JSON ESTRICTO (sin markdown, solo json):
{
  "name": "Nombre Paciente",
  "diagnosis": "Diagnóstico",
  "clinicalNotes": "Resumen breve",
  "timeline": [
    { "date": "YYYY-MM-DD", "type": "Consulta/Quimio/Imagen", "note": "Detalle" }
  ]
}
Texto:
${text}
`;

      const jsonString = await callGemini(prompt, 'Eres un auditor médico experto. Responde SOLO en JSON.');
      
      // Limpieza por si la IA devuelve bloques de código ```json ...
