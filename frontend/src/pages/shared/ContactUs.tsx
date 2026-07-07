import { useState, useEffect } from "react";
import { Phone, Mail, ChevronDown, ChevronUp, MessageCircle } from "lucide-react";
import api from "../../api";

type FAQ = {
  id: number;
  question: string;
  answer: string;
};

type Settings = {
  contact_phone?: string;
  contact_email?: string;
  contact_whatsapp?: string;
};

export default function ContactUs() {
  const [settings, setSettings] = useState<Settings>({});
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [settingsRes, faqsRes] = await Promise.all([
          api.get("/public/settings"),
          api.get("/public/faqs"),
        ]);
        setSettings(settingsRes.data.settings || {});
        setFaqs(faqsRes.data.faqs || []);
      } catch (err) {
        console.error("Failed to load contact info", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const toggleFaq = (id: number) => {
    setExpandedFaq(expandedFaq === id ? null : id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const phone = settings.contact_phone || "+91 9876543210";
  const email = settings.contact_email || "support@sewabuddy.com";
  const whatsapp = settings.contact_whatsapp || phone.replace(/\D/g, "");

  return (
    <div className="px-4 py-4 md:py-6 pb-20 md:pb-6 max-w-2xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 md:mb-6">Contact Us</h1>

      {/* Contact Cards */}
      <div className="grid gap-3 mb-6">
        {/* Phone */}
        <a
          href={`tel:${phone}`}
          className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-amber-300 hover:shadow-sm transition-all active:scale-[0.98]"
        >
          <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center flex-shrink-0">
            <Phone className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 mb-0.5">Call Us</p>
            <p className="text-sm md:text-base font-medium text-gray-900 truncate">{phone}</p>
          </div>
        </a>

        {/* WhatsApp */}
        <a
          href={`https://wa.me/${whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-green-300 hover:shadow-sm transition-all active:scale-[0.98]"
        >
          <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center flex-shrink-0">
            <MessageCircle className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 mb-0.5">WhatsApp</p>
            <p className="text-sm md:text-base font-medium text-gray-900 truncate">Chat with us</p>
          </div>
        </a>

        {/* Email */}
        <a
          href={`mailto:${email}`}
          className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all active:scale-[0.98]"
        >
          <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
            <Mail className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 mb-0.5">Email Us</p>
            <p className="text-sm md:text-base font-medium text-gray-900 truncate">{email}</p>
          </div>
        </a>

      </div>

      {/* FAQs */}
      {faqs.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Frequently Asked Questions</h2>
          <div className="space-y-2">
            {faqs.map((faq) => (
              <div
                key={faq.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <button
                  onClick={() => toggleFaq(faq.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-900 pr-4">{faq.question}</span>
                  {expandedFaq === faq.id ? (
                    <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                </button>
                {expandedFaq === faq.id && (
                  <div className="px-4 pb-4 pt-0">
                    <p className="text-sm text-gray-600 leading-relaxed">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Support hours */}
      <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-100">
        <p className="text-sm text-amber-800 font-medium">Support Hours</p>
        <p className="text-sm text-amber-700 mt-1">Monday - Saturday: 9:00 AM - 8:00 PM</p>
        <p className="text-sm text-amber-700">Sunday: 10:00 AM - 6:00 PM</p>
      </div>
    </div>
  );
}
