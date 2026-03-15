import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { Search, Upload, FileText, Eye, Hash, Download, Filter, X, Tag, NotebookPen } from "lucide-react";

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
      const matchesLabel = labelFilters.length === 0 || labelFilters.includes(paper.label);
      return matchesSearch && matchesInclude && matchesReview && matchesLabel;
    });
  }, [enrichedPapers, search, includeFilter, reviewFilter, labelFilters]);

  const uniqueLabels = useMemo(() => {
    const labels = new Set();
    enrichedPapers.forEach(p => {
      if (p.label) labels.add(p.label);
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

  function updateNumber(key, value) {
    setManualNumbers((prev) => {
      const next = { ...prev };
      if (!String(value).trim()) delete next[key];
      else next[key] = String(value).trim();
      return next;
    });
  }

  async function updateIncludeGuess(key, value) {
    const nextPapers = papers.map(p => {
      if (paperKey(p) === key) {
        return { ...p, include_guess: value };
      }
      return p;
    });
    setPapers(nextPapers);

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

  async function updatePaperLabel(key, value) {
    const nextPapers = papers.map(p => {
      if (paperKey(p) === key) {
        return { ...p, label: value };
      }
      return p;
    });
    setPapers(nextPapers);
    setAddingLabelId(null);
    setNewLabelText("");

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
    const yes = papers.filter((p) => String(p.include_guess).toLowerCase() === "yes").length;
    const maybe = papers.filter((p) => String(p.include_guess).toLowerCase() === "maybe").length;
    const matched = enrichedPapers.filter((p) => p._matchedPdf).length;
    const included = enrichedPapers.filter((p) => p._review.decision === "included").length;
    const excluded = enrichedPapers.filter((p) => p._review.decision === "excluded").length;
    return { total, yes, maybe, matched, included, excluded };
  }, [papers, enrichedPapers]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Literature Organizer</h1>
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

      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[0.6fr_1.4fr]">
          <div className="rounded-3xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-3 bg-slate-50 rounded-t-3xl">
              <div className="flex items-center gap-4">
                <h2 className="font-medium shrink-0">Paper list</h2>
                <div className="flex items-center gap-1.5 border-l pl-4 border-slate-200">
                  <Filter className="h-3.5 w-3.5 text-slate-400" />
                  <select
                    value={includeFilter}
                    onChange={(e) => setIncludeFilter(e.target.value)}
                    className="bg-transparent text-sm text-slate-700 outline-none cursor-pointer"
                  >
                    <option value="all">All</option>
                    <option value="include">Include</option>
                    <option value="maybe">Maybe</option>
                    <option value="exclude">Exclude</option>
                  </select>
                </div>
              </div>
              <div className="text-xs text-slate-500 whitespace-nowrap">
                number = {filteredPapers.length}
              </div>
            </div>
            <div className="max-h-[72vh] overflow-auto">
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
                        </div>

                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => setSelectedKey(paper._key)}
                            className="w-full text-left"
                          >
                            <div className="flex flex-col gap-1">
                              <div className="text-sm font-medium leading-tight text-slate-900 hover:text-violet-700 flex items-start gap-1.5">
                                {paper._matchedPdf && (
                                  <FileText className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                                )}
                                <span>{paper.title || "Untitled paper"}</span>
                              </div>
                              <div className="text-xs text-slate-500">
                                {paper.year || "Unknown year"} · {paper.venue || "Unknown venue"}
                              </div>
                              <div className="mt-2.5 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                {["Include", "Maybe", "Exclude"].map(opt => {
                                  let isSelected = (paper.include_guess || "").toLowerCase() === opt.toLowerCase();
                                  let colorClass = "bg-white border-slate-200 text-slate-600 hover:bg-slate-50";
                                  if (isSelected) {
                                    if (opt === "Include") colorClass = "bg-emerald-100 border-emerald-200 text-emerald-800";
                                    else if (opt === "Exclude") colorClass = "bg-rose-100 border-rose-200 text-rose-800";
                                    else colorClass = "bg-amber-100 border-amber-200 text-amber-800";
                                  }
                                  return (
                                    <button
                                      key={opt}
                                      onClick={() => updateIncludeGuess(paper._key, opt)}
                                      className={`px-2.5 py-0.5 text-xs rounded-full border transition-colors ${colorClass}`}
                                    >
                                      {opt}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="mt-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                {paper.label ? (
                                  <div className="group flex items-center gap-1">
                                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                                      <Tag className="h-3 w-3" />
                                      {paper.label}
                                    </span>
                                    <button 
                                      onClick={() => updatePaperLabel(paper._key, "")}
                                      className="text-slate-400 hover:text-rose-500 hidden group-hover:block"
                                      title="Remove label"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  addingLabelId === paper._key ? (
                                    <form 
                                      className="flex items-center gap-1"
                                      onSubmit={(e) => {
                                        e.preventDefault();
                                        updatePaperLabel(paper._key, newLabelText);
                                      }}
                                    >
                                      <input 
                                        type="text" 
                                        autoFocus
                                        value={newLabelText}
                                        onChange={(e) => setNewLabelText(e.target.value)}
                                        placeholder="Label name"
                                        className="text-xs border rounded px-2 py-0.5 outline-none w-24"
                                      />
                                      <button type="submit" className="text-xs text-white bg-violet-600 hover:bg-violet-700 px-2 py-0.5 rounded">Save</button>
                                      <button type="button" onClick={() => setAddingLabelId(null)} className="text-xs text-slate-500 hover:bg-slate-100 px-2 py-0.5 rounded">Cancel</button>
                                    </form>
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
                                  )
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

          <div className="rounded-3xl border bg-white shadow-sm overflow-hidden flex flex-col">

            {!selectedPaper ? (
              <div className="flex min-h-[72vh] items-center justify-center p-8 text-center text-sm text-slate-500">
                Select a paper from the left to preview it here.
              </div>
            ) : (
              <div className="flex h-[85vh] flex-col">
                <div className="flex-1">
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
      </div>
    </div>
  );
}
