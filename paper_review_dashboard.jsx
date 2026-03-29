import React, { useEffect, useMemo, useState, useRef } from "react";
import Papa from "papaparse";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Search, Upload, FileText, Eye, Hash, Download, Filter, X, Tag, NotebookPen, BookOpen, Layers, ChevronLeft, ChevronRight, Save, Plus, FileArchive, Loader2, BarChart3, Pencil, Check } from "lucide-react";
import DashboardView from "./DashboardView";

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeFilename(name) {
  return String(name || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop();
}

function cleanFilenameForUpload(title) {
  return String(title || "")
    .replace(/[/\\?%*:|"<>_]/g, "_")
    .trim();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function paperKey(paper) {
  return `${paper.year || ""}::${normalizeText(paper.title)}`;
}

function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data || []),
      error: reject,
    });
  });
}

function downloadText(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function numberBadgeColor(value) {
  if (!value) return "bg-slate-100 text-slate-500 border-slate-200";
  return "bg-violet-100 text-violet-700 border-violet-200";
}

function decisionBadgeClass(value) {
  if (value === "included") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (value === "excluded") return "bg-rose-100 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function parseTags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatTags(tags) {
  return (tags || []).join(", ");
}

function formatPaperMetadata(year, rawVenue) {
  const cleanYear = String(year || "").trim();
  if (!rawVenue) return { authors: cleanYear || "Unknown", venue: "" };
  let parts = String(rawVenue).split(" - ").map(p => p.trim()).filter(Boolean);
  parts = parts.map(p => {
    let cleaned = p;
    if (cleanYear) {
      const yearRegex = new RegExp(`[,\\s]+${cleanYear}$`, "g");
      cleaned = cleaned.replace(yearRegex, "");
      const standaloneYearRegex = new RegExp(`\\b${cleanYear}\\b`, "g");
      cleaned = cleaned.replace(standaloneYearRegex, "");
    }
    cleaned = cleaned.replace(/…/g, "").replace(/\.\.\./g, "");
    cleaned = cleaned.replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
    cleaned = cleaned.replace(/,$/, "");
    return cleaned;
  }).filter(p => {
    if (!p) return false;
    if (/^\d+$/.test(p)) return false;
    const domainRegex = /\b(ieee|acm|mdpi|springer|nature|science|sciencedirect|dl\.acm\.org|ieeexplore|org|com|net|edu|gov|io)\b/i;
    const urlPattern = /\.(org|com|net|edu|gov|io|ca|uk|de|au|jp|cn)$/i;
    if (urlPattern.test(p) || (p.includes('.') && domainRegex.test(p))) return false;
    return true;
  });
  parts = [...new Set(parts)];
  const authorsPart = parts[0] || "";
  const venuePart = parts.slice(1).join(" · ") || "";
  return {
    authors: [cleanYear, authorsPart].filter(Boolean).join(" · "),
    venue: venuePart
  };
}

const AutoResizeTextarea = ({ value, onChange, placeholder }) => {
  const textareaRef = useRef(null);
  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };
  useEffect(() => { adjustHeight(); }, [value]);
  useEffect(() => {
    const timer = setTimeout(adjustHeight, 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full bg-white border border-slate-200 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all overflow-hidden resize-none min-h-[80px]"
    />
  );
};

function LabelDescriptionView({ labelData, uniqueLabels, saveLabelData, savingLabels }) {
  const [localData, setLocalData] = useState(labelData);
  useEffect(() => { setLocalData(labelData); }, [labelData]);
  const handleUpdate = (label, field, value) => {
    setLocalData(prev => ({
      ...prev,
      [label]: {
        ...(prev[label] || { description: "", keywords: "" }),
        [field]: value
      }
    }));
  };
  return (
    <div className="h-full overflow-y-auto bg-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-slate-900">Label Descriptions</h2>
          <button
            onClick={() => saveLabelData(localData)}
            disabled={savingLabels}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 shadow-sm transition-colors disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {savingLabels ? "Saving..." : "Save Changes"}
          </button>
        </div>
        <div className="grid gap-6">
          {uniqueLabels.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
              <Tag className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No labels found. Add labels to papers first.</p>
            </div>
          ) : (
            uniqueLabels.map(label => (
              <div key={label} className="bg-slate-50 rounded-xl border p-6 hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-violet-100 rounded-lg"><Tag className="h-5 w-5 text-violet-600" /></div>
                  <h3 className="text-lg font-semibold text-slate-800">{label}</h3>
                </div>
                <div className="grid gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                    <AutoResizeTextarea
                      value={localData[label]?.description || ""}
                      onChange={(e) => handleUpdate(label, 'description', e.target.value)}
                      placeholder="Detailed explanation..."
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function PaperReviewDashboard() {
  const [papers, setPapers] = useState([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [search, setSearch] = useState("");
  const [includeFilter, setIncludeFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [manualNumbers, setManualNumbers] = useState({});
  const [annotations, setAnnotations] = useState({});
  const [labelFilters, setLabelFilters] = useState([]);
  const [addingLabelId, setAddingLabelId] = useState(null);
  const [newLabelText, setNewLabelText] = useState("");
  const [status, setStatus] = useState("Loading CSV...");
  const [currentView, setCurrentView] = useState("papers");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [labelData, setLabelData] = useState({});
  const [savingLabels, setSavingLabels] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editingData, setEditingData] = useState({ title: "", year: "", authors: "", venue: "" });
  const [pastPapers, setPastPapers] = useState([]);
  const [futurePapers, setFuturePapers] = useState([]);
  const downloadMenuTimerRef = useRef(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}paper_search_results.csv`)
      .then(res => res.text()).then(text => parseCsv(text)).then(rows => {
        setPapers(rows);
        setStatus(`Loaded ${rows.length} papers.`);
      }).catch(err => setStatus(`Error: ${err.message}`));
    fetch(`${import.meta.env.BASE_URL}label_descriptions.json`)
      .then(res => res.ok ? res.json() : {}).then(data => setLabelData(data))
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    const savedNumbers = JSON.parse(localStorage.getItem("manual-numbers") || "{}");
    setManualNumbers(savedNumbers);
    const savedAnnotations = JSON.parse(localStorage.getItem("annotations") || "{}");
    setAnnotations(savedAnnotations);
  }, []);

  useEffect(() => { localStorage.setItem("manual-numbers", JSON.stringify(manualNumbers)); }, [manualNumbers]);
  useEffect(() => { localStorage.setItem("annotations", JSON.stringify(annotations)); }, [annotations]);

  const enrichedPapers = useMemo(() => {
    return papers.map((paper, idx) => {
      const key = paperKey(paper);
      const filename = sanitizeFilename(paper.pdf_file);
      const matchedPdf = paper.pdf_file ? { url: `${import.meta.env.BASE_URL}papers/${filename}` } : null;
      const review = annotations[key] || { decision: "undecided", notes: "", tags: [] };
      return {
        ...paper, _index: idx + 1, _key: key, _number: manualNumbers[key] || "", _matchedPdf: matchedPdf,
        _review: { decision: review.decision || "undecided", notes: review.notes || "", tags: Array.isArray(review.tags) ? review.tags : [] },
      };
    });
  }, [papers, manualNumbers, annotations]);

  const filteredPapers = useMemo(() => {
    const q = normalizeText(search);
    return enrichedPapers.filter(paper => {
      const matchesSearch = !q || [paper.title, paper.abstract, paper.venue, paper.query, paper._review.notes, formatTags(paper._review.tags)].some(f => normalizeText(f).includes(q));
      const matchesInclude = includeFilter === "all" || String(paper.include_guess || "").toLowerCase() === includeFilter;
      const matchesReview = reviewFilter === "all" || paper._review.decision === reviewFilter;
      const paperLabels = String(paper.label || "").split(",").map(l => l.trim()).filter(Boolean);
      const matchesLabel = labelFilters.length === 0 || labelFilters.some(f => paperLabels.includes(f));
      return matchesSearch && matchesInclude && matchesReview && matchesLabel;
    });
  }, [enrichedPapers, search, includeFilter, reviewFilter, labelFilters]);

  const uniqueLabels = useMemo(() => {
    const labels = new Set();
    enrichedPapers.forEach(p => String(p.label || "").split(",").forEach(l => l.trim() && labels.add(l.trim())));
    return Array.from(labels).sort();
  }, [enrichedPapers]);

  useEffect(() => {
    if (!filteredPapers.some(p => p._key === selectedKey)) setSelectedKey(filteredPapers[0]?._key || "");
  }, [filteredPapers, selectedKey]);

  const selectedPaper = filteredPapers.find(p => p._key === selectedKey) || null;

  async function saveToCsv(nextPapers) {
    const csvStr = Papa.unparse(nextPapers, { columns: ["source","query","title","year","venue","citation_count","relevance_score","include_guess","doi","paper_url","semantic_open_pdf","pdf_url","pdf_file","download_status","is_open_access","abstract","label"] });
    await fetch('/api/save-csv', { method: 'POST', body: csvStr });
  }

  function executePaperChange(nextPapers) {
    setPastPapers(prev => [papers, ...prev].slice(0, 50));
    setFuturePapers([]);
    setPapers(nextPapers);
    saveToCsv(nextPapers);
  }

  const handleSaveMetadata = async () => {
    if (!editingKey) return;
    const combinedVenue = [editingData.authors, editingData.venue].filter(Boolean).join(" - ");
    const updated = papers.map(p => paperKey(p) === editingKey ? { ...p, title: editingData.title, year: editingData.year, venue: combinedVenue } : p);
    executePaperChange(updated);
    setEditingKey(null);
  };

  async function updateIncludeGuess(key, value) {
    const next = papers.map(p => paperKey(p) === key ? { ...p, include_guess: value } : p);
    executePaperChange(next);
  }

  async function updatePaperLabel(key, nextLabel) {
    const updated = papers.map(p => {
      if (paperKey(p) === key) {
        const currentLabels = String(p.label || "").split(",").map(l => l.trim()).filter(Boolean);
        const exists = currentLabels.includes(nextLabel);
        const nextLabelsSet = exists ? currentLabels.filter(l => l !== nextLabel) : [...currentLabels, nextLabel];
        return { ...p, label: nextLabelsSet.join(", ") };
      }
      return p;
    });
    executePaperChange(updated);
    if (addingLabelId === key) {
      setAddingLabelId(null);
      setNewLabelText("");
    }
  }

  async function saveLabelData(newData) {
    setSavingLabels(true);
    const res = await fetch('/api/save-labels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newData) });
    if (res.ok) { setLabelData(newData); setStatus("Labels saved."); }
    setSavingLabels(false);
  }

  async function handleDownloadZip() {
    setIsDownloadingZip(true);
    const zip = new JSZip();
    zip.file("metadata.csv", Papa.unparse(filteredPapers));
    const folder = zip.folder("papers");
    await Promise.all(filteredPapers.filter(p => p._matchedPdf).map(async p => {
      const res = await fetch(p._matchedPdf.url);
      if (res.ok) folder.file(`${p.year} - ${cleanFilenameForUpload(p.title)}.pdf`, await res.blob());
    }));
    saveAs(await zip.generateAsync({ type: "blob" }), "papers.zip");
    setIsDownloadingZip(false);
  }

  return (
    <div className="h-screen flex bg-slate-50 text-slate-900 overflow-hidden">
      <div className={`shrink-0 border-r bg-slate-900 transition-all ${sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-16'} flex flex-col items-center py-4`}>
        <div className="flex-1 flex flex-col gap-6 items-center">
          <div className="p-2 mb-2"><div className="h-8 w-8 bg-violet-500 rounded-lg flex items-center justify-center font-bold text-white text-xl">L</div></div>
          {[ ['papers', Layers], ['labels', Tag], ['dashboard', BarChart3] ].map(([v, Icon]) => (
            <button key={v} onClick={() => setCurrentView(v)} className={`p-3 rounded-xl transition ${currentView === v ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><Icon className="h-6 w-6" /></button>
          ))}
        </div>
        <button onClick={() => setSidebarCollapsed(true)} className="p-2 text-slate-500 hover:text-white"><ChevronLeft className="h-5 w-5" /></button>
      </div>

      {sidebarCollapsed && <button onClick={() => setSidebarCollapsed(false)} className="fixed left-0 bottom-4 bg-slate-900 text-white p-1 rounded-r-lg z-50"><ChevronRight className="h-5 w-5" /></button>}

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="shrink-0 border-b bg-white/90 backdrop-blur px-4 py-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-2xl font-semibold">VIS Method</h1>
          <div className="flex flex-wrap gap-2">{uniqueLabels.map(lbl => (
            <button key={lbl} onClick={() => setLabelFilters(prev => prev.includes(lbl) ? prev.filter(l => l !== lbl) : [...prev, lbl])} className={`px-3 py-1.5 text-xs font-medium rounded-full border transition ${labelFilters.includes(lbl) ? "bg-violet-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{lbl}</button>
          ))}</div>
          <div className="flex items-center gap-3 border rounded-2xl px-3 py-2 lg:w-64"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-full text-sm outline-none" /></div>
        </div></div>

        <div className="flex-1 overflow-hidden relative">
          {currentView === 'labels' ? (
            <LabelDescriptionView labelData={labelData} uniqueLabels={uniqueLabels} saveLabelData={saveLabelData} savingLabels={savingLabels} />
          ) : currentView === 'dashboard' ? (
            <DashboardView papers={enrichedPapers} />
          ) : (
            <div className="grid h-full lg:grid-cols-[400px_1fr]">
              <div className="h-full flex flex-col border-r bg-white overflow-hidden">
                <div className="flex items-center justify-between border-b px-4 py-3 bg-slate-50">
                  <div className="flex items-center gap-4">
                    <h2 className="font-medium">Paper ID</h2>
                    <select value={includeFilter} onChange={e => setIncludeFilter(e.target.value)} className="bg-transparent text-sm outline-none"><option value="all">All</option><option value="included">Included</option><option value="maybe">Maybe</option><option value="excluded">Excluded</option></select>
                  </div>
                  <div className="relative" onMouseEnter={() => setShowDownloadMenu(true)} onMouseLeave={() => setShowDownloadMenu(false)}>
                    <div className="text-xs text-slate-500 cursor-pointer">{filteredPapers.length} items</div>
                    {showDownloadMenu && filteredPapers.length > 0 && (
                      <div className="absolute top-full right-0 z-50 bg-white shadow-2xl border p-2 rounded-lg">
                        <button onClick={handleDownloadZip} disabled={isDownloadingZip} className="flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-violet-700 px-4 py-2">{isDownloadingZip ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />} Download Zip</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-auto">
                  {filteredPapers.map(paper => {
                    const isSelected = paper._key === selectedKey;
                    return (
                      <div key={paper._key} className={`border-b px-4 py-3 transition ${isSelected ? "bg-violet-50" : "hover:bg-slate-50"}`} onClick={() => setSelectedKey(paper._key)}>
                        <div className="flex gap-3">
                          <div className="flex w-8 flex-col items-center gap-2 pt-1 shrink-0">
                            <div className="h-6 w-6 flex items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">{paper._index}</div>
                            {paper._matchedPdf && <FileText className="h-4 w-4 text-emerald-500" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="relative group">
                              {editingKey === paper._key ? (
                                <div className="flex flex-col gap-2 p-2 bg-white border border-violet-200 rounded shadow-sm" onClick={e => e.stopPropagation()}>
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Edit Title</div>
                                  <input autoFocus value={editingData.title} onChange={e => setEditingData({...editingData, title: e.target.value})} className="text-sm p-1.5 border rounded w-full outline-none focus:border-violet-400 bg-slate-50" placeholder="Title" />
                                  
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Edit Year</div>
                                  <input value={editingData.year} onChange={e => setEditingData({...editingData, year: e.target.value})} className="text-sm p-1.5 border rounded w-full outline-none focus:border-violet-400 bg-slate-50" placeholder="Year" />

                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Edit Authors</div>
                                  <input value={editingData.authors} onChange={e => setEditingData({...editingData, authors: e.target.value})} className="text-[11px] p-1.5 border rounded w-full outline-none focus:border-violet-400 bg-slate-50" placeholder="Authors" />
                                  
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Edit Venue & Source</div>
                                  <input value={editingData.venue} onChange={e => setEditingData({...editingData, venue: e.target.value})} className="text-[11px] p-1.5 border rounded w-full outline-none focus:border-violet-400 bg-slate-50" placeholder="Venue" />

                                  <div className="flex gap-2 justify-end mt-1">
                                    <button onClick={() => setEditingKey(null)} className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded transition"><X className="h-3 w-3" /> Cancel</button>
                                    <button onClick={handleSaveMetadata} className="flex items-center gap-1 px-2 py-1 text-xs bg-violet-600 text-white hover:bg-violet-700 rounded shadow-sm transition"><Check className="h-3 w-3" /> Save</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="text-sm font-medium leading-tight text-slate-900 group-hover:text-violet-700 transition-colors line-clamp-2">{paper.title}</div>
                                  {(() => {
                                    const meta = formatPaperMetadata(paper.year, paper.venue);
                                    return (
                                      <>
                                        <div className="text-[11px] font-medium text-slate-600 mt-1 line-clamp-1">{meta.authors}</div>
                                        {meta.venue && <div className="text-[10px] text-slate-400 italic line-clamp-1 leading-tight">{meta.venue}</div>}
                                      </>
                                    );
                                  })()}
                                  <div className="mt-2.5 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                    {["Include", "Maybe", "Exclude"].map(opt => {
                                      const val = opt.toLowerCase() === "include" ? "included" : opt.toLowerCase() === "exclude" ? "excluded" : "maybe";
                                      const isSel = (paper.include_guess || "").toLowerCase() === val;
                                      let colorClass = "bg-white border-slate-200 text-slate-600 hover:bg-slate-50";
                                      if (isSel) {
                                        if (val === "included") colorClass = "bg-emerald-100 border-emerald-200 text-emerald-800 font-bold";
                                        else if (val === "excluded") colorClass = "bg-rose-100 border-rose-200 text-rose-800 font-bold";
                                        else colorClass = "bg-amber-100 border-amber-200 text-amber-800 font-bold";
                                      }
                                      return (
                                        <button key={opt} onClick={() => updateIncludeGuess(paper._key, val)} className={`px-2.5 py-0.5 text-[10px] rounded-full border transition ${colorClass}`}>
                                          {opt}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <button onClick={e => { 
                                    e.stopPropagation(); 
                                    setEditingKey(paper._key); 
                                    const parts = String(paper.venue || "").split(" - ").map(p => p.trim());
                                    setEditingData({
                                      title: paper.title, 
                                      year: paper.year || "",
                                      authors: parts[0] || "",
                                      venue: parts.slice(1).join(" - ") || ""
                                    }); 
                                  }} className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-violet-600 transition"><Pencil className="h-3.5 w-3.5" /></button>
                                </>
                              )}
                            </div>
                             <div className="mt-2.5 flex flex-wrap gap-1.5" onClick={e => e.stopPropagation()}>
                              {uniqueLabels.filter(l => paper.label?.includes(l)).map(l => (
                                <span key={l} className="group/tag inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-600 cursor-pointer" onClick={() => updatePaperLabel(paper._key, l)}>
                                  <Tag className="h-2.5 w-2.5" />
                                  {l}
                                  <X className="h-2 w-2 opacity-0 group-hover/tag:opacity-100" />
                                </span>
                              ))}
                              {addingLabelId === paper._key ? (
                                <div className="relative flex flex-col gap-1 w-full max-w-[200px]">
                                  <div className="flex items-center gap-1 bg-white border border-violet-200 rounded-md shadow-sm p-1">
                                    <input 
                                      autoFocus
                                      value={newLabelText}
                                      onChange={e => setNewLabelText(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === "Enter" && newLabelText.trim()) updatePaperLabel(paper._key, newLabelText.trim());
                                        if (e.key === "Escape") { setAddingLabelId(null); setNewLabelText(""); }
                                      }}
                                      className="text-[10px] px-1.5 py-0.5 outline-none flex-1 min-w-0"
                                      placeholder="Label name..."
                                    />
                                    <button onClick={() => newLabelText.trim() && updatePaperLabel(paper._key, newLabelText.trim())} className="text-emerald-600 hover:text-emerald-700 p-0.5 shrink-0"><Check className="h-3.5 w-3.5" /></button>
                                    <button onClick={() => { setAddingLabelId(null); setNewLabelText(""); }} className="text-slate-400 hover:text-slate-500 p-0.5 shrink-0"><X className="h-3.5 w-3.5" /></button>
                                  </div>
                                  
                                  {(() => {
                                    const suggestions = uniqueLabels.filter(l => !String(paper.label || "").includes(l) && (newLabelText === "" || l.toLowerCase().includes(newLabelText.toLowerCase())));
                                    if (suggestions.length === 0) return null;
                                    return (
                                      <div className="absolute top-full left-0 right-0 z-[100] mt-1 max-h-32 overflow-auto bg-white border border-slate-200 rounded-md shadow-lg p-1 animate-in fade-in slide-in-from-top-1 duration-100">
                                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tight px-1.5 py-1 border-b mb-1">Suggestions</div>
                                        {suggestions.map(l => (
                                          <button 
                                            key={l} 
                                            onClick={() => updatePaperLabel(paper._key, l)}
                                            className="w-full text-left px-1.5 py-1 text-[10px] text-slate-600 hover:bg-violet-50 hover:text-violet-700 rounded transition-colors"
                                          >
                                            {l}
                                          </button>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                              ) : (
                                <button
                                  onClick={() => setAddingLabelId(paper._key)}
                                  className="inline-flex items-center gap-1 rounded border border-dashed border-slate-300 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:border-violet-300 hover:text-violet-600 transition-colors"
                                >
                                  <Plus className="h-2.5 w-2.5" />
                                  Add Label
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="h-full bg-white relative overflow-hidden">
                {!selectedPaper ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">Select a paper to preview.</div>
                ) : (
                  <div className="h-full flex flex-col">
                    {selectedPaper._matchedPdf ? (
                      <iframe title={selectedPaper.title} src={selectedPaper._matchedPdf.url} className="w-full h-full border-none" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-slate-500">No PDF available.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
