import React, { useRef, useState, useEffect } from "react";
import { Poll } from "../types";
import { X, Download, Camera } from "lucide-react";
import * as htmlToImage from "html-to-image";

interface PosterGeneratorProps {
  poll: Poll;
  onClose: () => void;
}

export const PosterGenerator: React.FC<PosterGeneratorProps> = ({ poll, onClose }) => {
  const posterRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // Use a stable copy of options sorted by vote desc
  const sortedOptions = [...poll.options].sort((a, b) => b.vote_count - a.vote_count);
  const maxVotes = sortedOptions.length > 0 ? sortedOptions[0].vote_count : 1;
  const topVoted = sortedOptions[0];

  const handleGenerate = async () => {
    if (!posterRef.current) return;
    try {
      setIsGenerating(true);
      // Let any images load (sometimes html-to-image struggles if not loaded)
      // Usually standard usage is fine
      const dataUrl = await htmlToImage.toPng(posterRef.current, {
        quality: 1,
        pixelRatio: 2, // higher resolution
      });
      setDownloadUrl(dataUrl);
    } catch (error) {
      console.error("Failed to generate poster", error);
      alert("Failed to generate poster. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!downloadUrl) return;
    const link = document.createElement("a");
    link.download = `Poll-Result-${poll.id}.png`;
    link.href = downloadUrl;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-slate-50 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-white">
          <h2 className="text-lg font-black font-mono text-slate-800 flex items-center gap-2">
            <Camera className="w-5 h-5 text-brand-blue" /> Snapshot & Poster Engine
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          
          {/* Controls Panel */}
          <div className="w-full md:w-64 bg-white border-r border-slate-200 p-6 flex flex-col gap-6 overflow-y-auto">
            <div>
              <h3 className="font-bold text-slate-800 text-sm mb-2 uppercase font-mono tracking-wider">Export Settings</h3>
              <p className="text-xs text-slate-500 mb-4">
                Take a graphical snapshot of the current election/poll standings to share across external venues.
              </p>
              {!downloadUrl ? (
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="w-full bg-brand-blue hover:bg-blue-700 text-white font-bold py-3 rounded-lg text-sm transition flex items-center justify-center gap-2"
                >
                  {isGenerating ? "Rendering..." : "Generate Poster Snapshot"}
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-green-600 font-bold bg-green-50 p-2 rounded">
                    ✓ Render Sequence Complete
                  </p>
                  <button
                    onClick={handleDownload}
                    className="w-full bg-[#E54A4F] hover:bg-red-700 text-white font-bold py-3 rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-lg"
                  >
                    <Download className="w-4 h-4" /> Save Local image
                  </button>
                  <button
                    onClick={() => setDownloadUrl(null)}
                    className="w-full border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold py-2 rounded-lg text-xs transition"
                  >
                    Reset & Edit
                  </button>
                </div>
              )}
            </div>
            
            <div className="mt-auto">
               <p className="text-[10px] text-slate-400 font-mono">Snapshot engine relies on local client DOM capture capabilities.</p>
            </div>
          </div>

          {/* Canvas Preview Area */}
          <div className="flex-1 overflow-auto bg-[#e2e8f0] p-4 md:p-8 flex items-start justify-center">
            
            {downloadUrl ? (
              <img src={downloadUrl} alt="Generated Poster" className="max-w-full shadow-xl rounded h-auto object-contain border border-slate-300" />
            ) : (
              <div className="w-[800px] flex-shrink-0">
                <div 
                  className="w-full bg-[#27272a] overflow-hidden relative flex flex-col font-sans shadow-2xl"
                  ref={posterRef}
                  style={{ minHeight: "800px" }}
                >
                  {/* Poster Background Pattern/Dim */}
                  <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(45deg, #18181b 25%, transparent 25%, transparent 75%, #18181b 75%, #18181b), repeating-linear-gradient(45deg, #18181b 25%, #27272a 25%, #27272a 75%, #18181b 75%, #18181b)", backgroundPosition: "0 0, 10px 10px", backgroundSize: "20px 20px" }}></div>
                  
                  {/* Header */}
                  <div className="w-full pt-10 pb-4 flex flex-col items-center relative z-10">
                    <div className="flex items-center gap-2 text-white bg-emerald-600/20 px-6 py-2 rounded-lg border border-emerald-500/30 mb-6 shadow-sm">
                      <div className="w-8 h-8 bg-white text-emerald-700 rounded flex items-center justify-center font-black text-xs leading-none">
                        GOV<br/>TRK
                      </div>
                      <span className="font-extrabold text-xl tracking-widest">GOVTRACK CENTRAL</span>
                    </div>

                    <h1 className="text-4xl font-black text-white uppercase tracking-wider text-center px-4 max-w-3xl" style={{ textShadow: "0 4px 6px rgba(0,0,0,0.5)" }}>
                      {poll.title}
                    </h1>
                    <div className="bg-white text-slate-900 font-extrabold px-8 py-2 mt-4 rounded-full text-lg uppercase shadow-lg tracking-wide">
                      ELECTION RESULTS
                    </div>
                  </div>

                  {/* Main Content Area */}
                  <div className="flex-1 w-full px-10 pb-16 flex flex-col items-center z-10 relative">
                    
                    {/* Top Candidate */}
                    {topVoted && poll.total_votes > 0 && (
                      <div className="w-full max-w-2xl mx-auto mt-6 mb-8 relative flex justify-center">
                        <div className="flex items-end w-full justify-center">
                          <div className="w-36 h-36 shrink-0 relative z-20">
                            <div className="absolute -top-3 -left-3 bg-white text-slate-900 w-10 h-10 flex items-center justify-center rounded-full font-black text-xl shadow-xl z-30">
                              #1
                            </div>
                            {topVoted.photo_url ? (
                               // eslint-disable-next-line @next/next/no-img-element
                               <img src={`/api/proxy-image?url=${encodeURIComponent(topVoted.photo_url)}`} alt={topVoted.label} className="w-full h-full object-cover border-b-[8px]" style={{ borderBottomColor: topVoted.party_color || "#10b981" }} crossOrigin="anonymous" />
                            ) : (
                               <div className="w-full h-full bg-slate-300 flex items-center justify-center text-slate-500 font-black text-4xl uppercase border-b-[8px]" style={{ borderBottomColor: topVoted.party_color || "#10b981" }}>
                                 {topVoted.label.substring(0, 2)}
                               </div>
                            )}
                          </div>
                          
                          <div className="flex-1 flex flex-col pb-2 -ml-4 z-10 w-full min-w-0 max-w-sm">
                            <div className="flex items-center gap-3 mb-2 pl-6">
                              <span className="text-4xl font-black text-white" style={{ textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>
                                {poll.total_votes > 0 ? (topVoted.vote_count / poll.total_votes * 100).toFixed(2) : "0.00"}%
                              </span>
                              <span className="text-white px-2 py-1 rounded text-xs font-bold uppercase tracking-wider shadow-sm" style={{ backgroundColor: topVoted.party_color || "#10b981", opacity: 0.9 }}>
                                {topVoted.vote_count.toLocaleString()} VOTES
                              </span>
                            </div>
                            <div className="bg-white px-5 py-3 pl-8 rounded-r-xl border-l-[8px] shadow-xl w-full" style={{ borderLeftColor: topVoted.party_color || "#10b981" }}>
                              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter truncate leading-none mb-1">
                                {topVoted.label.split(',')[0]}
                              </h2>
                              <div className="text-white text-[10px] font-bold uppercase py-0.5 px-2 inline-block tracking-widest mt-1 max-w-full truncate rounded-sm" style={{ backgroundColor: topVoted.party_color || "#10b981" }}>
                                {topVoted.label.includes(',') ? topVoted.label.split(',').slice(1).join(',').trim() : topVoted.party || "LEADER"}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Grid of other Candidates */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-6 w-full max-w-4xl mx-auto">
                      {sortedOptions.slice(poll.total_votes > 0 ? 1 : 0).map((opt, idx) => {
                        const rank = (poll.total_votes > 0 ? 2 : 1) + idx;
                        const perc = poll.total_votes > 0 ? (opt.vote_count / poll.total_votes * 100).toFixed(2) : "0.00";
                        return (
                          <div key={opt.id} className="relative flex items-end w-full justify-center">
                            <div className="w-24 h-24 shrink-0 relative z-20">
                              <div className="absolute -top-2 -left-2 bg-white text-slate-900 w-7 h-7 flex items-center justify-center rounded-full font-black text-sm shadow-md z-30">
                                #{rank}
                              </div>
                              {opt.photo_url ? (
                                 // eslint-disable-next-line @next/next/no-img-element
                                 <img src={`/api/proxy-image?url=${encodeURIComponent(opt.photo_url)}`} alt={opt.label} className="w-full h-full object-cover border-b-[4px]" style={{ borderBottomColor: opt.party_color || "#059669" }} crossOrigin="anonymous" />
                              ) : (
                                 <div className="w-full h-full bg-slate-300 flex items-center justify-center text-slate-500 font-black text-2xl uppercase border-b-[4px]" style={{ borderBottomColor: opt.party_color || "#059669" }}>
                                   {opt.label.substring(0, 2)}
                                 </div>
                              )}
                            </div>

                            <div className="flex-1 flex flex-col pb-1.5 -ml-2 z-10 w-full min-w-0 max-w-[250px]">
                              <div className="flex items-center gap-2 mb-1 pl-4">
                                <span className="text-xl font-black text-white" style={{ textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>
                                  {perc}%
                                </span>
                                <span className="text-white px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shadow-sm" style={{ backgroundColor: opt.party_color || "#059669", opacity: 0.85 }}>
                                  {opt.vote_count.toLocaleString()} VOTES
                                </span>
                              </div>
                              <div className="bg-white px-3 py-1.5 pl-4 rounded-r flex flex-col justify-center border-l-[4px] shadow-lg min-h-[48px]" style={{ borderLeftColor: opt.party_color || "#059669" }}>
                                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter truncate leading-none mb-1">
                                  {opt.label.split(',')[0]}
                               </h3>
                                <div className="text-white text-[10px] font-bold uppercase py-0.5 px-2 inline-block tracking-wider max-w-max truncate rounded-sm" style={{ backgroundColor: opt.party_color || "#059669" }}>
                                  {opt.label.includes(',') ? opt.label.split(',').slice(1).join(',').trim() : opt.party || "CANDIDATE"}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="w-full mt-auto bg-white flex justify-between items-center px-10 py-6 z-10 border-t-4" style={{ borderTopColor: topVoted?.party_color || "#10b981" }}>
                    <div className="flex flex-col">
                      <div className="text-xl font-black text-slate-400 uppercase tracking-widest leading-none">
                        OUT OF
                      </div>
                      <div className="text-4xl font-black leading-none -ml-0.5 mt-1 flex items-center gap-3" style={{ color: topVoted?.party_color || "#10b981" }}>
                        {poll.total_votes.toLocaleString()}
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-tight flex flex-col">
                          <span>VOTES FROM GOVTRACK</span>
                          <span>CENTRAL DASHBOARD</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                       <span className="font-mono text-slate-400 text-[10px] font-bold uppercase tracking-widest bg-slate-100 px-2 py-1 rounded">
                         Official Final Result
                       </span>
                    </div>
                  </div>

                </div>
              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
};
