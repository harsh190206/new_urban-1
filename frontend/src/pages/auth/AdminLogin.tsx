import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api from "../../api";
import toast from "react-hot-toast";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/auth/admin/login", { email, password });
      const data = res.data;
      login(data.token, { ...data.admin, role: "ADMIN" }, "ADMIN");
      toast.success("Welcome, Admin!");
      navigate("/admin/dashboard");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 safe-area">
      <div className="bg-white rounded-lg border border-gray-200 w-full max-w-sm p-5 sm:p-6">
        <div className="text-center mb-6">
          <img src="/logo.jpg" alt="SewaBuddy" className="w-14 h-14 rounded-xl object-cover mx-auto mb-2 shadow-sm" />
          <h1 className="text-base font-bold text-gray-900">Admin Panel</h1>
          <p className="text-gray-400 text-xs">SewaBuddy Management</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-gray-400 outline-none text-sm"
            placeholder="admin@sewabuddy.com" />
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-gray-400 outline-none text-sm"
            placeholder="Password" />
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-gray-900 text-white rounded-full text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm">
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
