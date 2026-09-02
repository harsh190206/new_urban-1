import { useState, useEffect } from "react";
import { Plus, Trash2, Edit, X, Check, Save } from "lucide-react";
import api from "../../api";
import toast from "react-hot-toast";

type FAQ = {
  id: number;
  question: string;
  answer: string;
  order: number;
  isActive: boolean;
};

type Setting = {
  id: number;
  key: string;
  value: string;
  label: string | null;
};

const DEFAULT_SETTINGS = [
  { key: "contact_phone", label: "Phone Number", placeholder: "+91 9876543210" },
  { key: "contact_email", label: "Email", placeholder: "support@example.com" },
  { key: "contact_address", label: "Address", placeholder: "123, Street, City" },
  { key: "contact_whatsapp", label: "WhatsApp Number", placeholder: "919876543210" },
];

export default function AdminSettings() {
  const [, setSettings] = useState<Setting[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings form
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});

  // FAQ form
  const [showFaqForm, setShowFaqForm] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FAQ | null>(null);
  const [faqForm, setFaqForm] = useState({ question: "", answer: "", order: 0 });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [settingsRes, faqsRes] = await Promise.all([
        api.get("/admin/settings"),
        api.get("/admin/faqs"),
      ]);
      setSettings(settingsRes.data.settings || []);
      setFaqs(faqsRes.data.faqs || []);

      // Initialize settings form with existing values
      const settingsMap: Record<string, string> = {};
      for (const s of settingsRes.data.settings || []) {
        settingsMap[s.key] = s.value;
      }
      setSettingsForm(settingsMap);
    } catch (err) {
      console.error("Failed to load data", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAllSettings = async () => {
    setSaving(true);
    try {
      let savedCount = 0;
      for (const def of DEFAULT_SETTINGS) {
        const value = settingsForm[def.key];
        if (value) {
          await api.post("/admin/settings", { key: def.key, value, label: def.label });
          savedCount++;
        }
      }
      if (savedCount === 0) {
        toast.error("Please fill in at least one field to save");
      } else {
        toast.success("Contact info saved successfully!");
      }
      fetchData();
    } catch (err: any) {
      console.error("Failed to save settings", err);
      toast.error(err.response?.data?.error || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleAddFaq = async () => {
    if (!faqForm.question.trim() || !faqForm.answer.trim()) return;

    try {
      if (editingFaq) {
        await api.put(`/admin/faqs/${editingFaq.id}`, faqForm);
        toast.success("FAQ updated!");
      } else {
        await api.post("/admin/faqs", faqForm);
        toast.success("FAQ added!");
      }
      setFaqForm({ question: "", answer: "", order: 0 });
      setShowFaqForm(false);
      setEditingFaq(null);
      fetchData();
    } catch (err: any) {
      console.error("Failed to save FAQ", err);
      toast.error(err.response?.data?.error || "Failed to save FAQ");
    }
  };

  const handleEditFaq = (faq: FAQ) => {
    setEditingFaq(faq);
    setFaqForm({ question: faq.question, answer: faq.answer, order: faq.order });
    setShowFaqForm(true);
  };

  const handleDeleteFaq = async (id: number) => {
    if (!confirm("Delete this FAQ?")) return;
    try {
      await api.delete(`/admin/faqs/${id}`);
      toast.success("FAQ deleted");
      fetchData();
    } catch (err: any) {
      console.error("Failed to delete FAQ", err);
      toast.error(err.response?.data?.error || "Failed to delete FAQ");
    }
  };

  const handleToggleFaq = async (faq: FAQ) => {
    try {
      await api.put(`/admin/faqs/${faq.id}`, { isActive: !faq.isActive });
      toast.success(faq.isActive ? "FAQ hidden" : "FAQ activated");
      fetchData();
    } catch (err: any) {
      console.error("Failed to toggle FAQ", err);
      toast.error(err.response?.data?.error || "Failed to update FAQ");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-4 md:py-6 pb-20 md:pb-6 max-w-4xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-6">Site Settings</h1>

      {/* Contact Information */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
        <div className="space-y-4">
          {DEFAULT_SETTINGS.map((def) => (
            <div key={def.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {def.label}
              </label>
              <input
                type="text"
                value={settingsForm[def.key] || ""}
                onChange={(e) => setSettingsForm({ ...settingsForm, [def.key]: e.target.value })}
                placeholder={def.placeholder}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
          ))}
          <button
            onClick={handleSaveAllSettings}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            <Save size={16} />
            {saving ? "Saving..." : "Save Contact Info"}
          </button>
        </div>
      </div>

      {/* FAQs */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">FAQs</h2>
          <button
            onClick={() => {
              setEditingFaq(null);
              setFaqForm({ question: "", answer: "", order: faqs.length });
              setShowFaqForm(true);
            }}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            <Plus size={16} /> Add FAQ
          </button>
        </div>

        {/* FAQ Form */}
        {showFaqForm && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
                <input
                  type="text"
                  value={faqForm.question}
                  onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
                  placeholder="Enter the question"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Answer</label>
                <textarea
                  value={faqForm.answer}
                  onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
                  placeholder="Enter the answer"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order</label>
                <input
                  type="number"
                  value={faqForm.order}
                  onChange={(e) => setFaqForm({ ...faqForm, order: parseInt(e.target.value) || 0 })}
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddFaq}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  <Check size={16} /> {editingFaq ? "Update" : "Add"}
                </button>
                <button
                  onClick={() => {
                    setShowFaqForm(false);
                    setEditingFaq(null);
                    setFaqForm({ question: "", answer: "", order: 0 });
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
                >
                  <X size={16} /> Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FAQ List */}
        <div className="space-y-2">
          {faqs.length === 0 && !showFaqForm && (
            <p className="text-sm text-gray-500 text-center py-8">No FAQs added yet. Click "Add FAQ" to create one.</p>
          )}
          {faqs.map((faq) => (
            <div
              key={faq.id}
              className={`p-4 rounded-lg border ${faq.isActive ? "bg-white border-gray-200" : "bg-gray-50 border-gray-200 opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 mb-1">{faq.question}</p>
                  <p className="text-sm text-gray-600 line-clamp-2">{faq.answer}</p>
                  <p className="text-xs text-gray-400 mt-1">Order: {faq.order}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleToggleFaq(faq)}
                    className={`p-1.5 rounded-lg text-xs ${faq.isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}
                    title={faq.isActive ? "Active" : "Inactive"}
                  >
                    {faq.isActive ? "Active" : "Hidden"}
                  </button>
                  <button
                    onClick={() => handleEditFaq(faq)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Edit size={16} className="text-gray-500" />
                  </button>
                  <button
                    onClick={() => handleDeleteFaq(faq.id)}
                    className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} className="text-red-500" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
