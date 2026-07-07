import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import api from "../../api";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { Camera, X, ChevronRight, ChevronLeft, Check, ChevronDown } from "lucide-react";

type Category = { id: number; name: string; slug: string; documentRequirements: DocReq[] };
type DocReq = { id: number; name: string; description: string | null; isRequired: boolean };

const STEPS_AGENT = ["Basic Info", "Categories", "Documents", "Bank Details"];

function IndiaFlag() {
  return (
    <svg width="22" height="15" viewBox="0 0 22 15" xmlns="http://www.w3.org/2000/svg">
      <rect width="22" height="5" fill="#FF9933" />
      <rect y="5" width="22" height="5" fill="#FFFFFF" />
      <rect y="10" width="22" height="5" fill="#138808" />
      <circle cx="11" cy="7.5" r="2" fill="none" stroke="#000080" strokeWidth="0.6" />
      <circle cx="11" cy="7.5" r="0.4" fill="#000080" />
    </svg>
  );
}

function USAFlag() {
  return (
    <svg width="22" height="15" viewBox="0 0 22 15" xmlns="http://www.w3.org/2000/svg">
      {[0,1,2,3,4,5].map((i) => (
        <rect key={i} y={i * 2.5} width="22" height="2.5" fill={i % 2 === 0 ? "#B22234" : "#FFFFFF"} />
      ))}
      <rect width="9" height="8" fill="#3C3B6E" />
    </svg>
  );
}

const COUNTRIES = [
  { value: "INDIA", label: "India", code: "+91", Flag: IndiaFlag },
  { value: "USA", label: "USA", code: "+1", Flag: USAFlag },
];

export default function Register() {
  const { login, token, role: authRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // If an agent is already authenticated (resumed from login), start at the right step
  const resumeStep = (location.state as any)?.resumeStep ?? 0;
  const isResuming = !!(location.state as any)?.resumeStep;

  const [role, setRoleState] = useState<"USER" | "AGENT">(
    isResuming || (authRole === "AGENT" && token) ? "AGENT" : "USER"
  );
  const [step, setStep] = useState<number>(isResuming ? resumeStep : 0);
  const [form, setForm] = useState({ email: "", password: "", name: "", address: "", pin: "", city: "", phone: "", phoneCountry: "INDIA" });
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [docFiles, setDocFiles] = useState<Record<number, File>>({});
  const [docPreviews, setDocPreviews] = useState<Record<number, string>>({});
  const [alreadyUploadedReqIds, setAlreadyUploadedReqIds] = useState<Set<number>>(new Set());
  const [bankForm, setBankForm] = useState({ accountNumber: "", holderName: "", ifscCode: "", bankName: "" });
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [cities, setCities] = useState<{ id: number; name: string; state: string | null }[]>([]);
  const [citySuggestions, setCitySuggestions] = useState<typeof cities>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const cityRef = useRef<HTMLDivElement>(null);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const countryPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get("/auth/cities/active").then((r) => setCities(r.data.cities)).catch(() => {});
    api.get("/auth/categories/active").then((r) => setCategories(r.data.categories)).catch(() => {});
  }, []);

  // When resuming, fetch profile to get current categories & uploaded docs
  useEffect(() => {
    if (!isResuming) return;
    setProfileLoading(true);
    api.get("/agents/profile")
      .then((res) => {
        const agent = res.data.agent;
        // Restore selected category IDs so uniqueDocReqs computes correctly
        const catIds = (agent.categories ?? []).map((ac: any) => ac.categoryId);
        setSelectedCategoryIds(catIds);
        // Track already-uploaded docs so UI shows them as satisfied
        const uploadedIds = new Set<number>(
          (agent.documents ?? [])
            .filter((d: any) => d.status !== "REJECTED")
            .map((d: any) => d.requirementId as number)
        );
        setAlreadyUploadedReqIds(uploadedIds);
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [isResuming]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) setShowCitySuggestions(false);
      if (countryPickerRef.current && !countryPickerRef.current.contains(e.target as Node)) setShowCountryPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.value;
    setForm({ ...form, [k]: val });
    if (k === "city") {
      const q = val.trim().toLowerCase();
      setCitySuggestions(q ? cities.filter((c) => c.name.includes(q)).slice(0, 8) : []);
      setShowCitySuggestions(!!q);
    }
  };

  const handlePhoneInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "");
    setForm({ ...form, phone: val });
  };

  const pickCity = (name: string) => { setForm({ ...form, city: name }); setShowCitySuggestions(false); };

  const toggleCategory = (id: number) => {
    setSelectedCategoryIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const handleDocFile = (reqId: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPEG, PNG and WebP images are allowed"); return;
    }
    if (file.size > 5 * 1024 * 1024) { toast.error("File size must be under 5 MB"); return; }
    setDocFiles((prev) => ({ ...prev, [reqId]: file }));
    setDocPreviews((prev) => ({ ...prev, [reqId]: URL.createObjectURL(file) }));
  };

  const removeDoc = (reqId: number) => {
    setDocFiles((prev) => { const n = { ...prev }; delete n[reqId]; return n; });
    setDocPreviews((prev) => { const n = { ...prev }; delete n[reqId]; return n; });
  };

  const selectedCategories = categories.filter((c) => selectedCategoryIds.includes(c.id));
  const allDocReqs = selectedCategories.flatMap((c) => c.documentRequirements);

  // Merge documents with same name
  const uniqueDocReqs = Object.values(
    allDocReqs.reduce((acc, req) => {
      const key = req.name.toLowerCase();
      if (!acc[key]) {
        acc[key] = { ...req };
      } else {
        if (req.isRequired) acc[key].isRequired = true;
        if (!acc[key].description && req.description) acc[key].description = req.description;
      }
      return acc;
    }, {} as Record<string, DocReq>)
  );

  const requiredDocs = uniqueDocReqs.filter((r) => r.isRequired);

  const canProceedStep = (s: number): boolean => {
    if (s === 0) return !!form.name && !!form.email && !!form.password && !!form.address && !!form.pin && !!form.city;
    if (s === 1) return selectedCategoryIds.length > 0;
    // A required doc is satisfied if it's newly uploaded OR already on the server
    if (s === 2) return requiredDocs.every((r) => docFiles[r.id] || alreadyUploadedReqIds.has(r.id));
    return true;
  };

  // ─── STEP 0: Validate locally, no API call ───────────────────────────────
  const handleStep0 = () => {
    if (!canProceedStep(0)) return;
    setStep(1);
  };

  // ─── STEP 1: Create the account with basic info + categories ─────────────
  // For resumed sessions (already authenticated), just save categories.
  const handleStep1 = async () => {
    if (!canProceedStep(1)) return;
    setLoading(true);
    try {
      if (isResuming) {
        // Agent already exists — just update categories
        await api.post("/agents/categories/save", { categoryIds: selectedCategoryIds });
        toast.success("Categories saved! Now upload your documents.");
      } else {
        // Fresh registration — create the account now with basic info + categories
        const formData = new FormData();
        formData.append("email", form.email);
        formData.append("password", form.password);
        formData.append("name", form.name);
        formData.append("address", form.address);
        formData.append("pin", form.pin);
        formData.append("city", form.city);
        formData.append("phone", form.phone);
        formData.append("phoneCountry", form.phoneCountry);
        formData.append("type", "general");
        formData.append("categoryIds", JSON.stringify(selectedCategoryIds));
        const res = await api.post("/auth/agent/register", formData);
        const data = res.data;
        // Log in immediately — every subsequent API call is authenticated
        login(data.token, { ...data.agent, role: "AGENT" }, "AGENT");
        toast.success("Account created! Now upload your documents.");
      }
      setStep(2);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || "Failed";
      if (err.response?.status === 409) {
        toast.error("Email already registered. Please login to continue your setup.");
        navigate("/login", { state: { hint: "agent" } });
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── STEP 2: Upload documents one by one ─────────────────────────────────
  const handleStep2 = async () => {
    if (!canProceedStep(2)) return;
    setLoading(true);
    try {
      const entries = Object.entries(docFiles);
      for (const [reqId, file] of entries) {
        const fd = new FormData();
        fd.append("document", file);
        await api.post(`/agents/documents/${reqId}`, fd);
      }
      toast.success("Documents uploaded! Almost done.");
      setStep(3);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to upload one or more documents");
    } finally {
      setLoading(false);
    }
  };

  // ─── STEP 3: Bank details (optional) then finish ──────────────────────────
  const handleStep3 = async () => {
    setLoading(true);
    try {
      const hasBankDetails = bankForm.accountNumber && bankForm.holderName && bankForm.ifscCode && bankForm.bankName;
      if (hasBankDetails) {
        await api.put("/agents/bank-details", bankForm);
      }
      toast.success("Registration complete! Your profile is under review.");
      navigate("/agent/dashboard");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to save bank details");
    } finally {
      setLoading(false);
    }
  };

  // ─── USER REGISTRATION (unchanged) ───────────────────────────────────────
  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/user/register", {
        email: form.email, password: form.password, name: form.name,
        address: form.address, pin: form.pin, city: form.city, phone: form.phone, phoneCountry: form.phoneCountry,
      });
      toast.success("Registration successful! Please login.");
      navigate("/login");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-md focus:ring-1 focus:ring-gray-400 focus:bg-white outline-none text-sm";


  // ─── USER REGISTRATION UI ─────────────────────────────────────────────────
  if (role === "USER") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 safe-area">
        <div className="bg-white rounded-lg border border-gray-200 w-full max-w-sm p-5 sm:p-6">
          <div className="text-center mb-5">
            <img src="/logo.jpg" alt="SewaBuddy" className="w-12 h-12 rounded-xl object-cover mx-auto mb-2 shadow-sm" />
            <h1 className="text-lg font-bold text-gray-900">Create Account</h1>
            <p className="text-gray-400 text-xs mt-0.5">Join Sewa<span className="text-amber-500">Buddy</span> today</p>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-md p-0.5 mb-4">
            {(["USER", "AGENT"] as const).map((r) => (
              <button key={r} onClick={() => { setRoleState(r); setStep(0); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition ${role === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"}`}>
                {r === "USER" ? "Customer" : "Service Partner"}
              </button>
            ))}
          </div>
          <form onSubmit={handleUserSubmit} className="space-y-2.5">
            <input type="text" required value={form.name} onChange={set("name")} className={inputCls} placeholder="Full name" />
            <input type="email" required value={form.email} onChange={set("email")} className={inputCls} placeholder="Email address" />
            <input type="password" required value={form.password} onChange={set("password")} className={inputCls} placeholder="Password" />
            <div className="flex gap-2">
              <div className="relative w-[110px] flex-shrink-0" ref={countryPickerRef}>
                <button type="button" onClick={() => setShowCountryPicker((v) => !v)}
                  className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-md focus:ring-1 focus:ring-gray-400 outline-none text-sm cursor-pointer flex items-center justify-between gap-1">
                  {(() => { const C = COUNTRIES.find((c) => c.value === form.phoneCountry) ?? COUNTRIES[0]; return <><C.Flag /><span className="text-xs">{C.code}</span></>; })()}
                  <ChevronDown size={12} className="text-gray-400 shrink-0" />
                </button>
                {showCountryPicker && (
                  <div className="absolute z-30 w-full bg-white border border-gray-200 rounded-md shadow-lg mt-1">
                    {COUNTRIES.map((c) => (
                      <button key={c.value} type="button"
                        onClick={() => { setForm({ ...form, phoneCountry: c.value }); setShowCountryPicker(false); }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0 flex items-center gap-2">
                        <c.Flag />{c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input type="text" inputMode="numeric" required value={form.phone} onChange={handlePhoneInput} className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md focus:ring-1 focus:ring-gray-400 focus:bg-white outline-none text-sm min-w-0" placeholder="Phone number" />
            </div>
            <input type="text" required value={form.address} onChange={set("address")} className={inputCls} placeholder="Address" />
            <div className="grid grid-cols-2 gap-2">
              <input type="text" inputMode="numeric" pattern="[0-9]*" required value={form.pin} onChange={(e) => { const val = e.target.value.replace(/\D/g, ""); setForm({ ...form, pin: val }); }} className={inputCls} placeholder="PIN code" />
              <div className="relative" ref={cityRef}>
                <input type="text" value={form.city} onChange={set("city")}
                  onFocus={() => { if (form.city.trim()) setShowCitySuggestions(true); }}
                  className={inputCls} placeholder="City" />
                {showCitySuggestions && citySuggestions.length > 0 && (
                  <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-md shadow-lg mt-1 max-h-32 overflow-y-auto">
                    {citySuggestions.map((c) => (
                      <button key={c.id} type="button" onClick={() => pickCity(c.name)}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-gray-50 text-xs capitalize border-b border-gray-50 last:border-0">
                        {c.name} {c.state && <span className="text-[10px] text-gray-400">({c.state})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-gray-900 text-white rounded-full text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm mt-1">
              {loading ? "Registering..." : "Create Account"}
            </button>
          </form>
          <p className="text-center text-xs text-gray-400 mt-5">
            Already have an account?{" "}
            <Link to="/login" className="text-gray-900 hover:underline font-semibold">Sign In</Link>
          </p>
        </div>
      </div>
    );
  }

  // ─── AGENT MULTI-STEP REGISTRATION UI ────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 safe-area">
      <div className="bg-white rounded-lg border border-gray-200 w-full max-w-md p-5 sm:p-6">
        <div className="text-center mb-4">
          <img src="/logo.jpg" alt="SewaBuddy" className="w-12 h-12 rounded-xl object-cover mx-auto mb-2 shadow-sm" />
          <h1 className="text-lg font-bold text-gray-900">
            {isResuming ? "Complete Your Profile" : "Become a Partner"}
          </h1>
          <p className="text-gray-400 text-xs mt-0.5">
            {isResuming
              ? "Pick up where you left off"
              : <>Join Sewa<span className="text-amber-500">Buddy</span> as a service provider</>}
          </p>
        </div>

        {!isResuming && (
          <div className="flex gap-1 bg-gray-100 rounded-md p-0.5 mb-4">
            {(["USER", "AGENT"] as const).map((r) => (
              <button key={r} onClick={() => { setRoleState(r); setStep(0); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition ${role === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"}`}>
                {r === "USER" ? "Customer" : "Service Partner"}
              </button>
            ))}
          </div>
        )}

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-5">
          {STEPS_AGENT.map((s, i) => (
            <div key={s} className="flex-1 flex flex-col items-center">
              <div className={`w-full h-1 rounded-full mb-1 transition-colors ${i <= step ? "bg-gray-900" : "bg-gray-200"}`} />
              <span className={`text-[10px] ${i <= step ? "text-gray-900 font-semibold" : "text-gray-400"}`}>{s}</span>
            </div>
          ))}
        </div>

        {/* STEP 0: Basic Info */}
        {step === 0 && (
          <div className="space-y-2.5">
            <input type="text" value={form.name} onChange={set("name")} className={inputCls} placeholder="Full name" />
            <input type="email" value={form.email} onChange={set("email")} className={inputCls} placeholder="Email address" />
            <input type="password" value={form.password} onChange={set("password")} className={inputCls} placeholder="Password" />
            <div className="flex gap-2">
              <div className="relative w-[110px] flex-shrink-0" ref={countryPickerRef}>
                <button type="button" onClick={() => setShowCountryPicker((v) => !v)}
                  className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-md focus:ring-1 focus:ring-gray-400 outline-none text-sm cursor-pointer flex items-center justify-between gap-1">
                  {(() => { const C = COUNTRIES.find((c) => c.value === form.phoneCountry) ?? COUNTRIES[0]; return <><C.Flag /><span className="text-xs">{C.code}</span></>; })()}
                  <ChevronDown size={12} className="text-gray-400 shrink-0" />
                </button>
                {showCountryPicker && (
                  <div className="absolute z-30 w-full bg-white border border-gray-200 rounded-md shadow-lg mt-1">
                    {COUNTRIES.map((c) => (
                      <button key={c.value} type="button"
                        onClick={() => { setForm({ ...form, phoneCountry: c.value }); setShowCountryPicker(false); }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0 flex items-center gap-2">
                        <c.Flag />{c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input type="text" inputMode="numeric" value={form.phone} onChange={handlePhoneInput} className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md focus:ring-1 focus:ring-gray-400 focus:bg-white outline-none text-sm min-w-0" placeholder="Phone number" />
            </div>
            <input type="text" value={form.address} onChange={set("address")} className={inputCls} placeholder="Address" />
            <div className="grid grid-cols-2 gap-2">
              <input type="text" inputMode="numeric" pattern="[0-9]*" value={form.pin} onChange={(e) => { const val = e.target.value.replace(/\D/g, ""); setForm({ ...form, pin: val }); }} className={inputCls} placeholder="PIN code" />
              <div className="relative" ref={cityRef}>
                <input type="text" value={form.city} onChange={set("city")}
                  onFocus={() => { if (form.city.trim()) setShowCitySuggestions(true); }}
                  className={inputCls} placeholder="City" />
                {showCitySuggestions && citySuggestions.length > 0 && (
                  <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-md shadow-lg mt-1 max-h-32 overflow-y-auto">
                    {citySuggestions.map((c) => (
                      <button key={c.id} type="button" onClick={() => pickCity(c.name)}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-gray-50 text-xs capitalize border-b border-gray-50 last:border-0">
                        {c.name} {c.state && <span className="text-[10px] text-gray-400">({c.state})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="text-[10px] text-gray-400 pt-0.5">
              💡 Your account will be created on the next step — you can save your progress and resume later.
            </p>
          </div>
        )}

        {/* STEP 1: Category Selection */}
        {step === 1 && (
          <div>
            <p className="text-sm text-gray-600 mb-3">Select the services you provide:</p>
            {categories.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">No categories available</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {categories.map((cat) => {
                  const selected = selectedCategoryIds.includes(cat.id);
                  return (
                    <button key={cat.id} type="button" onClick={() => toggleCategory(cat.id)}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${selected ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-gray-900 capitalize">{cat.name}</span>
                        {selected && <Check size={14} className="text-gray-900" />}
                      </div>
                      <p className="text-[10px] text-gray-400">{cat.documentRequirements.length} doc{cat.documentRequirements.length !== 1 ? "s" : ""} required</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Document Uploads */}
        {step === 2 && (
          <div>
            {profileLoading ? (
              <p className="text-gray-400 text-sm text-center py-8">Loading your documents...</p>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-3">Upload required documents for your selected categories:</p>
                {uniqueDocReqs.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">No documents required. You can proceed!</p>
                ) : (
                  <div className="space-y-3">
                    {uniqueDocReqs.map((req) => (
                      <div key={req.id}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <label className="block text-[11px] text-gray-500 uppercase font-medium">{req.name}</label>
                          {req.isRequired && <span className="text-[9px] text-red-500 font-bold">REQUIRED</span>}
                          {alreadyUploadedReqIds.has(req.id) && (
                            <span className="text-[9px] text-green-600 font-bold ml-auto">✓ UPLOADED</span>
                          )}
                        </div>
                        {req.description && <p className="text-[10px] text-gray-400 mb-1">{req.description}</p>}
                        {alreadyUploadedReqIds.has(req.id) && !docPreviews[req.id] ? (
                          <div className="flex items-center gap-2 h-12 border border-green-200 bg-green-50 rounded-md px-3">
                            <span className="text-green-600 text-xs font-medium">Already uploaded ✓</span>
                            <button type="button" onClick={() => {
                              setAlreadyUploadedReqIds(prev => { const n = new Set(prev); n.delete(req.id); return n; });
                            }} className="ml-auto text-[10px] text-gray-400 hover:text-red-500 transition">Replace</button>
                          </div>
                        ) : docPreviews[req.id] ? (
                          <div className="relative rounded-md overflow-hidden border border-gray-200 bg-gray-50">
                            <img src={docPreviews[req.id]} alt={req.name} className="w-full h-24 object-cover" />
                            <button type="button" onClick={() => removeDoc(req.id)}
                              className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 shadow hover:bg-red-50">
                              <X size={12} className="text-red-500" />
                            </button>
                            <p className="text-[10px] text-gray-400 text-center py-0.5 truncate px-1">{docFiles[req.id]?.name}</p>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-gray-200 rounded-md cursor-pointer hover:border-gray-400 transition">
                            <Camera size={18} className="text-gray-300 mb-0.5" />
                            <span className="text-[11px] text-gray-400">Upload</span>
                            <span className="text-[9px] text-gray-300">JPEG, PNG, WebP · 5 MB</span>
                            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleDocFile(req.id)} />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* STEP 3: Bank Details */}
        {step === 3 && (
          <div className="space-y-2.5">
            <p className="text-sm text-gray-600 mb-1">Bank details for payouts (optional — add later from profile):</p>
            <input value={bankForm.holderName} onChange={(e) => setBankForm({ ...bankForm, holderName: e.target.value })} className={inputCls} placeholder="Account holder name" />
            <input value={bankForm.accountNumber} onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })} className={inputCls} placeholder="Account number" />
            <input value={bankForm.ifscCode} onChange={(e) => setBankForm({ ...bankForm, ifscCode: e.target.value })} className={inputCls} placeholder="IFSC code" />
            <input value={bankForm.bankName} onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })} className={inputCls} placeholder="Bank name" />
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex gap-2 mt-5">
          {step > 0 && step !== (isResuming ? resumeStep : 0) && (
            <button type="button" onClick={() => setStep(step - 1)}
              className="flex items-center gap-1 px-4 py-2.5 bg-gray-100 text-gray-600 rounded-full text-sm font-semibold hover:bg-gray-200 active:scale-[0.97] transition-all">
              <ChevronLeft size={14} /> Back
            </button>
          )}

          {step === 0 && (
            <button type="button" onClick={handleStep0} disabled={!canProceedStep(0)}
              className="flex-1 flex items-center justify-center gap-1 py-2.5 bg-gray-900 text-white rounded-full text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm">
              Next <ChevronRight size={14} />
            </button>
          )}

          {step === 1 && (
            <button type="button" onClick={handleStep1} disabled={!canProceedStep(1) || loading}
              className="flex-1 flex items-center justify-center gap-1 py-2.5 bg-gray-900 text-white rounded-full text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm">
              {loading
                ? (isResuming ? "Saving..." : "Creating Account...")
                : (isResuming ? <>Save Categories <ChevronRight size={14} /></> : <>Create Account & Continue <ChevronRight size={14} /></>)
              }
            </button>
          )}

          {step === 2 && (
            <button type="button" onClick={handleStep2} disabled={!canProceedStep(2) || loading}
              className="flex-1 flex items-center justify-center gap-1 py-2.5 bg-gray-900 text-white rounded-full text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm">
              {loading ? "Uploading..." : <>Upload Documents <ChevronRight size={14} /></>}
            </button>
          )}

          {step === 3 && (
            <button type="button" onClick={handleStep3} disabled={loading}
              className="flex-1 py-2.5 bg-gray-900 text-white rounded-full text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm">
              {loading ? "Finishing..." : "Complete Registration"}
            </button>
          )}
        </div>

        {step === 3 && (
          <button type="button" onClick={() => navigate("/agent/dashboard")}
            className="w-full mt-2 py-2 text-xs text-gray-400 hover:text-gray-600 transition">
            Skip bank details for now →
          </button>
        )}

        <p className="text-center text-xs text-gray-400 mt-5">
          Already have an account?{" "}
          <Link to="/login" className="text-gray-900 hover:underline font-semibold">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
