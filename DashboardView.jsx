import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, Legend, PieChart, Pie, Sector 
} from 'recharts';
import { Layout, TrendingUp, Book, Landmark, Tag, Calendar, PieChart as PieChartIcon } from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, colorClass }) => (
  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
    <div className={`p-3 rounded-xl ${colorClass}`}>
      <Icon className="h-6 w-6" />
    </div>
    <div>
      <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">{title}</p>
      <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
    </div>
  </div>
);

const ChartContainer = ({ title, subtitle, children }) => (
  <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 flex flex-col h-full">
    <div className="mb-6">
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
    <div className="flex-1 min-h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  </div>
);

const getCleanVenue = (p) => {
  const rawVenue = String(p.venue || "").trim();
  let parts = rawVenue.split(" - ").map(p => p.trim()).filter(Boolean);
  const year = String(p.year || "").trim();
  
  parts = parts.map(part => {
    let cleaned = part;
    if (year) {
      const yearRegex = new RegExp(`[,\\s]+${year}$`, "g");
      cleaned = cleaned.replace(yearRegex, "");
      const standaloneYearRegex = new RegExp(`\\b${year}\\b`, "g");
      cleaned = cleaned.replace(standaloneYearRegex, "");
    }
    cleaned = cleaned.replace(/…/g, "").replace(/\.\.\./g, "");
    cleaned = cleaned.replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
    cleaned = cleaned.replace(/,$/, "");
    return cleaned;
  }).filter(part => {
    if (!part) return false;
    if (/^\d+$/.test(part)) return false;
    const domainRegex = /\b(ieee|acm|mdpi|springer|nature|science|sciencedirect|dl\.acm\.org|ieeexplore|org|com|net|edu|gov|io)\b/i;
    const urlPattern = /\.(org|com|net|edu|gov|io|ca|uk|de|au|jp|cn)$/i;
    if (urlPattern.test(part) || (part.includes('.') && domainRegex.test(part))) return false;
    return true;
  });

  let venue = parts.slice(1).join(" · ") || parts[0] || 'Unknown';
  const low = venue.toLowerCase();
  if (low.includes('ieee trans') || low.includes('tvcg')) venue = 'IEEE TVCG';
  else if (low.includes('chi conference') || low.includes('sigchi')) venue = 'CHI';
  else if (low.includes('infovis')) venue = 'InfoVis';
  else if (low.includes('vast')) venue = 'VAST';
  else if (low.includes('eurovis')) venue = 'EuroVis';
  else if (low.includes('cg&a')) venue = 'IEEE CG&A';
  else if (low.includes('pacificvis')) venue = 'PacificVis';
  return venue;
};

export default function DashboardView({ papers }) {
  // Filter for 'included' papers
  const includedPapers = useMemo(() => {
    const isIncluded = (val) => {
      const low = val?.toLowerCase();
      return low === 'included' || low === 'include' || low === 'yes';
    };
    return papers.filter(p => isIncluded(p.include_guess) || isIncluded(p._review?.decision));
  }, [papers]);

  const stats = useMemo(() => {
    const total = includedPapers.length;
    const years = includedPapers.map(p => parseInt(p.year)).filter(Boolean);
    const minYear = years.length ? Math.min(...years) : 'N/A';
    const maxYear = years.length ? Math.max(...years) : 'N/A';
    
    // Unique venue count using cleaned logic
    const venues = includedPapers.map(p => getCleanVenue(p)).filter(v => v !== 'Unknown');
    const venueCounts = venues.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
    const venueCount = Object.keys(venueCounts).length;

    return { total, range: total ? `${minYear} – ${maxYear}` : 'N/A', venueCount };
  }, [includedPapers]);

  const yearlyData = useMemo(() => {
    const years = includedPapers.map(p => parseInt(p.year)).filter(Boolean);
    if (!years.length) return [];
    
    const min = Math.min(...years);
    const max = Math.max(...years);
    const counts = includedPapers.reduce((acc, p) => {
      const year = p.year || 'Unknown';
      acc[year] = (acc[year] || 0) + 1;
      return acc;
    }, {});

    const completeData = [];
    for (let y = min; y <= max; y++) {
      completeData.push({
        name: String(y),
        count: counts[String(y)] || 0
      });
    }
    
    // Add 'Unknown' if exists
    if (counts['Unknown']) {
      completeData.push({ name: 'Unknown', count: counts['Unknown'] });
    }
    
    return completeData;
  }, [includedPapers]);

  const venueData = useMemo(() => {
    const counts = includedPapers.reduce((acc, p) => {
      const venue = getCleanVenue(p);
      acc[venue] = (acc[venue] || 0) + 1;
      return acc;
    }, {});
    
    return Object.entries(counts)
      .filter(([name]) => name !== 'Unknown')
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 venues
  }, [includedPapers]);

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-8 pt-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Corpus Dashboard</h2>
            <p className="text-slate-500 mt-1 font-medium">Visualizing insights from {includedPapers.length} included papers</p>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard 
            title="Total Included" 
            value={stats.total} 
            icon={Book} 
            colorClass="bg-violet-100 text-violet-600" 
          />
          <StatCard 
            title="Time Spanning" 
            value={stats.range} 
            icon={Calendar} 
            colorClass="bg-emerald-100 text-emerald-600" 
          />
          <StatCard 
            title="Number of Venues" 
            value={stats.venueCount} 
            icon={Landmark} 
            colorClass="bg-amber-100 text-amber-600" 
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-12">
          <ChartContainer 
            title="Publication Timeline" 
            subtitle="Number of papers published per year"
          >
            <BarChart data={yearlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
              />
              <Tooltip 
                cursor={{ fill: '#f8fafc', radius: 10 }}
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', padding: '12px' }}
              />
              <Bar 
                dataKey="count" 
                fill="#7c3aed" 
                radius={[6, 6, 0, 0]} 
                barSize={32}
              >
                {yearlyData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#7c3aed' : '#a78bfa'} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>

          <ChartContainer 
            title="Top Publication Venues" 
            subtitle="Most frequent journals and conferences"
          >
            <BarChart 
              layout="vertical" 
              data={venueData} 
              margin={{ top: 10, right: 30, left: 40, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" hide />
              <YAxis 
                dataKey="name" 
                type="category" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 700 }}
                width={120}
              />
              <Tooltip 
                cursor={{ fill: '#f8fafc', radius: 10 }}
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', padding: '12px' }}
              />
              <Bar 
                dataKey="count" 
                fill="#10b981" 
                radius={[0, 6, 6, 0]} 
                barSize={20}
              >
                {venueData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#10b981' : '#34d399'} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  );
}
