import React, { useEffect, useMemo, useState, useRef } from "react";
import Papa from "papaparse";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Search, Upload, FileText, Eye, Hash, Download, Filter, X, Tag, NotebookPen, BookOpen, Layers, ChevronLeft, ChevronRight, Save, Plus, FileArchive, Loader2, BarChart3 } from "lucide-react";
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
    .pop()
    .trim();
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
  
  // Split by " - " which is common in SerpAPI venue field: Authors - Venue - Source
  let parts = String(rawVenue).split(" - ").map(p => p.trim()).filter(Boolean);
  
  // Specific cleanups for SerpAPI data
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
    // Filter out common publisher domains and generic URLs
    const domainRegex = /\b(ieee|acm|mdpi|springer|nature|science|sciencedirect|dl\.acm\.org|ieeexplore|org|com|net|edu|gov|io)\b/i;
    const urlPattern = /\.(org|com|net|edu|gov|io|ca|uk|de|au|jp|cn)$/i;
    if (urlPattern.test(p) || (p.includes('.') && domainRegex.test(p))) return false;
    return true;
  });

  parts = [...new Set(parts)];

  // Usually: parts[0] is authors, parts[1] is venue, parts[2] is more venue/source
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
      textarea.style.height = 'auto'; // Reset height to recalculate
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]); // Adjust when value changes

  // Also adjust on initial mount
  useEffect(() => {
    // Shorter delay to ensure DOM is ready and styles applied
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

  // Sync localData when labelData prop changes (e.g. after save)
  useEffect(() => {
    setLocalData(labelData);
  }, [labelData]);

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
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Label Descriptions</h2>
          </div>
          <button
            onClick={() => saveLabelData(localData)}
            disabled={savingLabels}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 shadow-sm transition-colors disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {savingLabels ? "Saving..." : "Save Changes"}
          </button>
        </div>

        <div className="grid gap-6">
          {uniqueLabels.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
              <Tag className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No labels found in the paper database. Add labels to papers first.</p>
            </div>
          ) : (
            uniqueLabels.map(label => (
              <div key={label} className="bg-slate-50 rounded-xl border p-6 hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-violet-100 rounded-lg">
                    <Tag className="h-5 w-5 text-violet-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800">{label}</h3>
                </div>
                
                <div className="grid gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                    <AutoResizeTextarea
                      value={localData[label]?.description || ""}
                      onChange={(e) => handleUpdate(label, 'description', e.target.value)}
                      placeholder="Detailed explanation of what this label represents..."
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
  const [csvName, setCsvName] = useState("paper_search_results.csv");
  const [status, setStatus] = useState("Loading CSV...");
  
  // Navigation & Label Views
  const [currentView, setCurrentView] = useState("papers"); // 'papers' | 'labels'
  const [sidebarWidth, setSidebarWidth] = useState(64); // Fixed width for icons
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [labelData, setLabelData] = useState({}); // { label: { description, keywords } }
  const [savingLabels, setSavingLabels] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const downloadMenuTimerRef = useRef(null);

  // History state for undo/redo
  const [pastPapers, setPastPapers] = useState([]);
  const [futurePapers, setFuturePapers] = useState([]);

  // Auto-fetch the CSV on component mount
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}paper_search_results.csv`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to load CSV");
        return res.text();
      })
      .then(text => parseCsv(text))
      .then(rows => {
        const mapped = rows.map((row) => ({
          source: row.source || "",
          query: row.query || "",
          title: row.title || "",
          year: row.year || "",
          venue: row.venue || "",
          citation_count: row.citation_count || "",
          relevance_score: row.relevance_score || "",
          include_guess: row.include_guess || "",
          doi: row.doi || "",
          paper_url: row.paper_url || "",
          pdf_url: row.pdf_url || "",
          pdf_file: row.pdf_file || "",
          download_status: row.download_status || "",
          is_open_access: row.is_open_access || "",
          abstract: row.abstract || "",
          label: row.label || "",
        }));
        setPapers(mapped);
        setStatus(`Automagically loaded ${mapped.length} papers.`);
      })
      .catch(err => setStatus(`Error loading CSV: ${err.message}`));

    // Fetch label descriptions
    fetch(`${import.meta.env.BASE_URL}label_descriptions.json`)
      .then(res => res.ok ? res.json() : {})
      .then(data => setLabelData(data))
      .catch(err => console.error("Error loading label descriptions:", err));
  }, []);

  useEffect(() => {
    try {
      const savedNumbers = JSON.parse(localStorage.getItem("paper-dashboard-manual-numbers") || "{}");
      setManualNumbers(savedNumbers);
    } catch {
      // ignore localStorage errors
    }

    try {
      const savedAnnotations = JSON.parse(localStorage.getItem("paper-dashboard-annotations") || "{}");
      setAnnotations(savedAnnotations);
    } catch {
      // ignore localStorage errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("paper-dashboard-manual-numbers", JSON.stringify(manualNumbers));
    } catch {
      // ignore localStorage errors
    }
  }, [manualNumbers]);

  useEffect(() => {
    try {
      localStorage.setItem("paper-dashboard-annotations", JSON.stringify(annotations));
    } catch {
      // ignore localStorage errors
    }
  }, [annotations]);

  const enrichedPapers = useMemo(() => {
    return papers.map((paper, idx) => {
      const key = paperKey(paper);
      // Construct PDF URL pointing to local /papers/ directory
      let matchedPdf = null;
      if (paper.pdf_file) {
        // e.g., /Users/zezhongwang/Downloads/papers/file.pdf => file.pdf
        const filename = sanitizeFilename(paper.pdf_file);
        matchedPdf = { url: `${import.meta.env.BASE_URL}papers/${filename}` };
      }

      const review = annotations[key] || { decision: "undecided", notes: "", tags: [] };

      return {
        ...paper,
        _index: idx + 1,
        _key: key,
        _number: manualNumbers[key] || "",
        _matchedPdf: matchedPdf,
        _review: {
          decision: review.decision || "undecided",
          notes: review.notes || "",
          tags: Array.isArray(review.tags) ? review.tags : [],
        },
        label: paper.label || "",
      };
    });
  }, [papers, manualNumbers, annotations]);

  const filteredPapers = useMemo(() => {
    const q = normalizeText(search);
    return enrichedPapers.filter((paper) => {
      const matchesSearch =
        !q ||
        normalizeText(paper.title).includes(q) ||
        normalizeText(paper.abstract).includes(q) ||
        normalizeText(paper.venue).includes(q) ||
        normalizeText(paper.query).includes(q) ||
        normalizeText(paper._review.notes).includes(q) ||
        normalizeText(formatTags(paper._review.tags)).includes(q);

      const matchesInclude = includeFilter === "all" || String(paper.include_guess || "").toLowerCase() === includeFilter;
      const matchesReview = reviewFilter === "all" || paper._review.decision === reviewFilter;
      const paperLabels = String(paper.label || "").split(",").map(l => l.trim()).filter(Boolean);
      const matchesLabel = labelFilters.length === 0 || labelFilters.some(f => paperLabels.includes(f));
      return matchesSearch && matchesInclude && matchesReview && matchesLabel;
    });
  }, [enrichedPapers, search, includeFilter, reviewFilter, labelFilters]);

  const uniqueLabels = useMemo(() => {
    const labels = new Set();
    enrichedPapers.forEach(p => {
      if (p.label) {
        String(p.label).split(",").forEach(l => {
          const trimmed = l.trim();
          if (trimmed) labels.add(trimmed);
        });
      }
    });
    return Array.from(labels).sort();
  }, [enrichedPapers]);

  useEffect(() => {
    if (!filteredPapers.length) {
      setSelectedKey("");
      return;
    }
    const stillExists = filteredPapers.some((p) => p._key === selectedKey);
    if (!stillExists) setSelectedKey(filteredPapers[0]._key);
  }, [filteredPapers, selectedKey]);

  const selectedPaper = filteredPapers.find((p) => p._key === selectedKey) || null;

  async function saveToCsv(nextPapers) {
    try {
      const csvStr = Papa.unparse(nextPapers, {
        columns: ["source","query","title","year","venue","citation_count","relevance_score","include_guess","doi","paper_url","semantic_open_pdf","pdf_url","pdf_file","download_status","is_open_access","abstract","label"]
      });
      await fetch('/api/save-csv', {
        method: 'POST',
        body: csvStr
      });
    } catch (e) {
      console.error(e);
    }
  }

  function executePaperChange(nextPapers) {
    setPastPapers(prev => [papers, ...prev].slice(0, 50));
    setFuturePapers([]);
    setPapers(nextPapers);
    saveToCsv(nextPapers);
  }

  function undo() {
    if (pastPapers.length === 0) return;
    const previous = pastPapers[0];
    const newPast = pastPapers.slice(1);
    setPastPapers(newPast);
    setFuturePapers(prev => [papers, ...prev]);
    setPapers(previous);
    saveToCsv(previous);
  }

  function redo() {
    if (futurePapers.length === 0) return;
    const next = futurePapers[0];
    const newFuture = futurePapers.slice(1);
    setFuturePapers(newFuture);
    setPastPapers(prev => [papers, ...prev]);
    setPapers(next);
    saveToCsv(next);
  }

  // Keyboard shortcuts for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isZ = e.key.toLowerCase() === 'z';
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isMod = isMac ? e.metaKey : e.ctrlKey;

      if (isMod && isZ) {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (!isMac && isMod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [papers, pastPapers, futurePapers]);

  async function updateIncludeGuess(key, value) {
    const nextPapers = papers.map(p => {
      if (paperKey(p) === key) {
        return { ...p, include_guess: value };
      }
      return p;
    });
    executePaperChange(nextPapers);
  }

  async function updatePaperLabel(key, value) {
    const nextPapers = papers.map(p => {
      if (paperKey(p) === key) {
        return { ...p, label: value };
      }
      return p;
    });
    executePaperChange(nextPapers);
    setAddingLabelId(null);
    setNewLabelText("");
  }

  async function uploadPdf(key, file) {
    if (!file) return;
    
    // Find the paper
    const paper = papers.find(p => paperKey(p) === key);
    if (!paper) return;

    setStatus(`Uploading ${file.name}...`);
    
    const expectedFilename = `${paper.year || "2024"} - ${cleanFilenameForUpload(paper.title)}.pdf`;
    
    try {
      const res = await fetch(`/api/upload-pdf?filename=${encodeURIComponent(expectedFilename)}`, {
        method: 'POST',
        body: file,
      });
      
      if (!res.ok) throw new Error("Upload failed.");
      const data = await res.json();
      
      const nextPapers = papers.map(p => {
        if (paperKey(p) === key) {
          return { ...p, pdf_file: data.path, download_status: 'downloaded' };
        }
        return p;
      });
      setPapers(nextPapers);
      setStatus(`Uploaded ${file.name} successfully!`);
      
      // Save CSV
      const csvStr = Papa.unparse(nextPapers, {
        columns: ["source","query","title","year","venue","citation_count","relevance_score","include_guess","doi","paper_url","semantic_open_pdf","pdf_url","pdf_file","download_status","is_open_access","abstract","label"]
      });
      await fetch('/api/save-csv', {
        method: 'POST',
        body: csvStr
      });
    } catch (e) {
      setStatus(`Error uploading: ${e.message}`);
    }
  }

  function updateAnnotation(key, patch) {
    setAnnotations((prev) => {
      const current = prev[key] || { decision: "undecided", notes: "", tags: [] };
      return {
        ...prev,
        [key]: {
          ...current,
          ...patch,
        },
      };
    });
  }

  function autoNumberVisible() {
    const next = { ...manualNumbers };
    filteredPapers.forEach((paper, index) => {
      next[paper._key] = String(index + 1);
    });
    setManualNumbers(next);
    setStatus(`Assigned numbers 1–${filteredPapers.length} to the currently visible papers.`);
  }

  function clearNumbers() {
    setManualNumbers({});
    setStatus("Cleared all assigned paper numbers.");
  }

  function exportNumbers() {
    const data = enrichedPapers.map((p) => ({
      number: p._number,
      decision: p._review.decision,
      tags: p._review.tags,
      notes: p._review.notes,
      title: p.title,
      year: p.year,
      venue: p.venue,
      include_guess: p.include_guess,
      citation_count: p.citation_count,
      paper_url: p.paper_url,
      pdf_file: p.pdf_file,
    }));

    downloadText("paper-review-annotations.json", JSON.stringify(data, null, 2));
    setStatus(`Exported ${data.length} annotated paper record(s).`);
  }

  function exportCsvReview() {
    const rows = enrichedPapers.map((p) => ({
      number: p._number,
      decision: p._review.decision,
      tags: formatTags(p._review.tags),
      notes: p._review.notes,
      title: p.title,
      year: p.year,
      venue: p.venue,
      include_guess: p.include_guess,
      citation_count: p.citation_count,
      paper_url: p.paper_url,
      pdf_file: p.pdf_file,
      label: p.label,
    }));

    const csv = Papa.unparse(rows);
    downloadText("paper-review-annotations.csv", csv, "text/csv;charset=utf-8;");
    setStatus(`Exported ${rows.length} paper annotation row(s) as CSV.`);
  }

  const stats = useMemo(() => {
    const total = papers.length;
    const includedCount = papers.filter((p) => String(p.include_guess).toLowerCase() === "included").length;
    const maybeCount = papers.filter((p) => String(p.include_guess).toLowerCase() === "maybe").length;
    const matched = enrichedPapers.filter((p) => p._matchedPdf).length;
    const included = enrichedPapers.filter((p) => p._review.decision === "included").length;
    const excluded = enrichedPapers.filter((p) => p._review.decision === "excluded").length;
    return { total, yes: includedCount, maybe: maybeCount, matched, included, excluded };
  }, [papers, enrichedPapers]);

  async function saveLabelData(newData) {
    setSavingLabels(true);
    try {
      const res = await fetch('/api/save-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newData, null, 2)
      });
      if (res.ok) {
        setLabelData(newData);
        setStatus("Label descriptions saved successfully.");
      } else {
        throw new Error("Failed to save label descriptions.");
      }
    } catch (err) {
      setStatus(`Error saving labels: ${err.message}`);
    } finally {
      setSavingLabels(false);
    }
  }

  async function handleDownloadZip() {
    if (filteredPapers.length === 0) return;
    setIsDownloadingZip(true);
    setStatus("Preparing ZIP...");

    try {
      const zip = new JSZip();
      
      // 1. Generate Metadata CSV
      const csvData = filteredPapers.map(p => ({
          title: p.title,
          year: p.year,
          venue: p.venue,
          authors: formatPaperMetadata(p.year, p.venue).authors,
          abstract: p.abstract,
          doi: p.doi,
          label: p.label,
          decision: p._review.decision,
          notes: p._review.notes,
          tags: formatTags(p._review.tags)
      }));
      
      const csvContent = Papa.unparse(csvData);
      zip.file("filtered_papers_metadata.csv", csvContent);

      // 2. Add PDFs
      const pdfFolder = zip.folder("papers");
      const fetchPromises = filteredPapers
        .filter(p => p._matchedPdf)
        .map(async (p) => {
          try {
            const response = await fetch(p._matchedPdf.url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const blob = await response.blob();
            // Standardize filename in zip: Year - Title.pdf
            const cleanTitle = cleanFilenameForUpload(p.title);
            const zipFileName = `${p.year || "2024"} - ${cleanTitle}.pdf`;
            pdfFolder.file(zipFileName, blob);
          } catch (e) {
            console.error(`Failed to fetch PDF for ${p.title}:`, e);
          }
        });

      await Promise.all(fetchPromises);

      // 3. Generate and Save ZIP
      const content = await zip.generateAsync({ type: "blob" });
      const downloadName = `VIS_Method_Papers_${new Date().toISOString().slice(0,10)}.zip`;
      saveAs(content, downloadName);
      
      setStatus(`Successfully downloaded ${filteredPapers.length} papers as ZIP.`);
    } catch (error) {
      console.error("ZIP Generation Error:", error);
      setStatus(`Error generating ZIP: ${error.message}`);
    } finally {
      setIsDownloadingZip(false);
    }
  }


  return (
    <div className="h-screen flex bg-slate-50 text-slate-900 overflow-hidden">
      {/* Navigation Sidebar */}
      <div 
        className={`shrink-0 border-r bg-slate-900 transition-all duration-300 flex flex-col items-center py-4 relative ${sidebarCollapsed ? 'w-0 overflow-hidden opacity-0' : 'w-16'}`}
      >
        <div className="flex flex-col gap-6 items-center flex-1">
          <div className="p-2 mb-2">
             <div className="h-8 w-8 bg-violet-500 rounded-lg flex items-center justify-center font-bold text-white text-xl">L</div>
          </div>
          
          <button 
            onClick={() => setCurrentView('papers')}
            className={`p-3 rounded-xl transition-all ${currentView === 'papers' ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            title="Paper List"
          >
            <Layers className="h-6 w-6" />
          </button>
          
          <button 
            onClick={() => setCurrentView('labels')}
            className={`p-3 rounded-xl transition-all ${currentView === 'labels' ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            title="Label Descriptions"
          >
            <Tag className="h-6 w-6" />
          </button>

          <button 
            onClick={() => setCurrentView('dashboard')}
            className={`p-3 rounded-xl transition-all ${currentView === 'dashboard' ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            title="Corpus Dashboard"
          >
            <BarChart3 className="h-6 w-6" />
          </button>
        </div>

        <div className="mt-auto pb-4">
          <button 
             onClick={() => setSidebarCollapsed(true)}
             className="p-2 text-slate-500 hover:text-white transition-colors"
             title="Collapse Sidebar"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        </div>
      </div>

      {sidebarCollapsed && (
        <button 
          onClick={() => setSidebarCollapsed(false)}
          className="fixed left-0 bottom-4 bg-slate-900 text-white p-1 rounded-r-lg shadow-lg z-50 hover:bg-violet-600 transition-colors"
          title="Expand Sidebar"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="shrink-0 border-b bg-white/90 backdrop-blur">

        <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">VIS Method Literature</h1>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mx-auto lg:max-w-2xl w-full">
              {uniqueLabels.map(lbl => {
                const isActive = labelFilters.includes(lbl);
                return (
                  <button
                    key={lbl}
                    onClick={() => {
                      setLabelFilters(prev => 
                        prev.includes(lbl) ? prev.filter(l => l !== lbl) : [...prev, lbl]
                      );
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive 
                        ? "bg-violet-600 text-white shadow-sm" 
                        : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <Tag className={`h-3.5 w-3.5 ${isActive ? "text-violet-200" : "text-slate-400"}`} />
                    {lbl}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 rounded-2xl border px-3 py-2 ml-auto lg:w-64">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Papers..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
              {search && (
                <button onClick={() => setSearch("")}>
                  <X className="h-4 w-4 text-slate-400" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden w-full relative">
        {currentView === 'labels' ? (
          <LabelDescriptionView 
            labelData={labelData} 
            uniqueLabels={uniqueLabels} 
            saveLabelData={saveLabelData}
            savingLabels={savingLabels}
          />
        ) : currentView === 'dashboard' ? (
          <DashboardView papers={enrichedPapers} />
        ) : (
          <div className="grid gap-0 h-full lg:grid-cols-[400px_1fr]">
            <div className="h-full flex flex-col border-r bg-white overflow-hidden">
              <div className="flex items-center justify-between border-b px-4 py-3 bg-slate-50">
                <div className="flex items-center gap-4">
                  <h2 className="font-medium shrink-0">Paper ID</h2>
                  <div className="flex items-center gap-1.5 border-l pl-4 border-slate-200">
                    <Filter className="h-3.5 w-3.5 text-slate-400" />
                    <select
                      value={includeFilter}
                      onChange={(e) => setIncludeFilter(e.target.value)}
                      className="bg-transparent text-sm text-slate-700 outline-none cursor-pointer"
                    >
                      <option value="all">All</option>
                      <option value="included">Included</option>
                      <option value="maybe">Maybe</option>
                      <option value="excluded">Excluded</option>
                    </select>
                  </div>
                </div>
                <div 
                  className="flex items-center gap-2 relative"
                  onMouseEnter={() => {
                    if (downloadMenuTimerRef.current) clearTimeout(downloadMenuTimerRef.current);
                    setShowDownloadMenu(true);
                  }}
                  onMouseLeave={() => {
                    downloadMenuTimerRef.current = setTimeout(() => {
                      setShowDownloadMenu(false);
                    }, 300); // 300ms delay to allow mouse transition
                  }}
                >
                  <div 
                    className="text-xs text-slate-500 whitespace-nowrap cursor-pointer hover:text-violet-600 transition-colors flex items-center gap-1 py-1"
                    onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                  >
                    {filteredPapers.length} {filteredPapers.length === 1 ? "item" : "items"}
                    <span className={`text-[10px] opacity-50 block transition-transform duration-200 ${showDownloadMenu ? 'rotate-[-90deg]' : 'rotate-90'}`}>›</span>
                  </div>

                  {showDownloadMenu && filteredPapers.length > 0 && (
                    <div 
                      className="absolute top-full right-0 z-[100] mt-0 min-w-[200px] bg-white rounded-lg shadow-2xl border border-slate-200 py-1.5 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadZip();
                          setShowDownloadMenu(false);
                        }}
                        disabled={isDownloadingZip}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-violet-50 hover:text-violet-700 transition-colors disabled:opacity-50"
                      >
                        {isDownloadingZip ? (
                          <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                        ) : (
                          <FileArchive className="h-4 w-4 text-violet-500" />
                        )}
                        <span className="whitespace-nowrap">
                          {isDownloadingZip ? "Generating ZIP..." : `Download ${filteredPapers.length} Items Zip`}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                {filteredPapers.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">No papers match the current filters.</div>
                ) : (
                  filteredPapers.map((paper) => {
                    const isSelected = paper._key === selectedKey;
                    return (
                      <div
                        key={paper._key}
                        className={`border-b px-4 py-3 transition ${isSelected ? "bg-violet-50" : "hover:bg-slate-50"}`}
                      >
                        <div className="flex gap-3">
                          <div className="flex w-12 flex-col items-center gap-2 pt-1 shrink-0">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                              {paper._index}
                            </div>
                            {paper._matchedPdf && (
                              <div className="mt-1 shadow-sm">
                                <svg width="24" height="28" viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-sm">
                                  <path d="M4 0C1.79086 0 0 1.79086 0 4V24C0 26.2091 1.79086 28 4 28H20C22.2091 28 24 26.2091 24 24V8L16 0H4Z" fill="#DCFCE7"/>
                                  <path d="M16 0V8H24L16 0Z" fill="#BBF7D0"/>
                                  <rect x="2" y="14" width="20" height="10" rx="1.5" fill="#10B981"/>
                                  <text x="12" y="21.5" textAnchor="middle" fill="white" style={{ fontSize: '8px', fontWeight: 'bold', fontFamily: 'system-ui, sans-serif' }}>PDF</text>
                                </svg>
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <button
                              onClick={() => setSelectedKey(paper._key)}
                              className="w-full text-left"
                            >
                              <div className="flex flex-col gap-1">
                                <div className="text-sm font-medium leading-tight text-slate-900 hover:text-violet-700">
                                  {paper.title || "Untitled paper"}
                                </div>
                                <div className="flex flex-col gap-0.5 mt-0.5">
                                  {(() => {
                                    const meta = formatPaperMetadata(paper.year, paper.venue);
                                    return (
                                      <>
                                        <div className="text-[11px] font-medium text-slate-600 line-clamp-1">
                                          {meta.authors}
                                        </div>
                                        {meta.venue && (
                                          <div className="text-[10px] text-slate-400 italic">
                                            {meta.venue}
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                                <div className="mt-2.5 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  {["Include", "Maybe", "Exclude"].map(opt => {
                                    const val = opt === "Include" ? "included" : opt === "Exclude" ? "excluded" : "maybe";
                                    let isSelected = (paper.include_guess || "").toLowerCase() === val;
                                    let colorClass = "bg-white border-slate-200 text-slate-600 hover:bg-slate-50";
                                    if (isSelected) {
                                      if (val === "included") colorClass = "bg-emerald-100 border-emerald-200 text-emerald-800";
                                      else if (val === "excluded") colorClass = "bg-rose-100 border-rose-200 text-rose-800";
                                      else colorClass = "bg-amber-100 border-amber-200 text-amber-800";
                                    }
                                    return (
                                      <button
                                        key={opt}
                                        onClick={() => updateIncludeGuess(paper._key, val)}
                                        className={`px-2.5 py-0.5 text-xs rounded-full border transition-colors ${colorClass}`}
                                      >
                                        {opt}
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                  {String(paper.label || "").split(",").map(l => l.trim()).filter(Boolean).map((lbl, idx) => (
                                    <div key={idx} className="group flex items-center gap-1">
                                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                                        <Tag className="h-3 w-3" />
                                        {lbl}
                                      </span>
                                      <button 
                                        onClick={() => {
                                          const currentLabels = String(paper.label || "").split(",").map(x => x.trim()).filter(Boolean);
                                          const nextLabels = currentLabels.filter(x => x !== lbl).join(", ");
                                          updatePaperLabel(paper._key, nextLabels);
                                        }}
                                        className="text-slate-400 hover:text-rose-500 hidden group-hover:block"
                                        title="Remove label"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  ))}

                                  {addingLabelId === paper._key ? (
                                    <div className="flex flex-col gap-2 p-2 border rounded-lg bg-slate-50 shadow-sm mt-1">
                                      <form 
                                        className="flex items-center gap-1"
                                        onSubmit={(e) => {
                                          e.preventDefault();
                                          const currentLabels = String(paper.label || "").split(",").map(x => x.trim()).filter(Boolean);
                                          if (newLabelText.trim() && !currentLabels.includes(newLabelText.trim())) {
                                            const nextLabels = [...currentLabels, newLabelText.trim()].join(", ");
                                            updatePaperLabel(paper._key, nextLabels);
                                          } else {
                                            setAddingLabelId(null);
                                          }
                                        }}
                                      >
                                        <input 
                                          type="text" 
                                          autoFocus
                                          value={newLabelText}
                                          onChange={(e) => setNewLabelText(e.target.value)}
                                          placeholder="New label..."
                                          className="text-xs border rounded px-2 py-1 outline-none w-32"
                                        />
                                        <button type="submit" className="text-xs text-white bg-violet-600 hover:bg-violet-700 px-2 py-1 rounded">Save</button>
                                        <button type="button" onClick={() => setAddingLabelId(null)} className="text-xs text-slate-500 hover:bg-slate-100 px-2 py-1 rounded">Cancel</button>
                                      </form>

                                      {/* Suggestions */}
                                      {uniqueLabels.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1 max-w-[240px]">
                                          <div className="w-full text-[10px] text-slate-400 font-medium mb-1">Or select from:</div>
                                          {uniqueLabels
                                            .filter(l => !String(paper.label || "").includes(l))
                                            .map(l => (
                                              <button
                                                key={l}
                                                type="button"
                                                onClick={() => {
                                                  const currentLabels = String(paper.label || "").split(",").map(x => x.trim()).filter(Boolean);
                                                  const nextLabels = [...currentLabels, l].join(", ");
                                                  updatePaperLabel(paper._key, nextLabels);
                                                  setAddingLabelId(null);
                                                }}
                                                className="px-1.5 py-0.5 text-[10px] bg-white border border-slate-200 rounded text-slate-500 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-600 transition"
                                              >
                                                {l}
                                              </button>
                                            ))
                                          }
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <button 
                                      onClick={() => {
                                        setAddingLabelId(paper._key);
                                        setNewLabelText("");
                                      }}
                                      className="inline-flex items-center gap-1 rounded border border-dashed border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
                                    >
                                      + Add label
                                    </button>
                                  )}
                                </div>
                              </div>
                            </button>

                            {!!paper._review.tags.length && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {paper._review.tags.map((tag) => (
                                  <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="h-full bg-white flex flex-col overflow-hidden">

              {!selectedPaper ? (
                <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">
                  Select a paper from the left to preview it here.
                </div>
              ) : (
                <div className="flex h-full flex-col">
                  <div className="flex-1 min-h-0 relative">
                    {selectedPaper._matchedPdf ? (
                      <iframe
                        title={selectedPaper.title}
                        src={selectedPaper._matchedPdf.url}
                        className="h-full w-full bg-slate-100"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500 bg-slate-50">
                        No matching PDF available. Either the PDF failed to download, or the paper does not have a PDF.
                      </div>
                    )}
                  </div>
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
