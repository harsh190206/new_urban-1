import { useAuth } from "../context/AuthContext";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";

export default function Navbar() {
  const { user, role, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  if (!isAuthenticated) return null;

  const links: { label: string; to: string }[] = (() => {
    if (role === "USER") return [
      { label: "Home", to: "/user/home" },
      { label: "Profile", to: "/user/profile" },
      { label: "Notifications", to: "/user/notifications" },
      { label: "Contact Us", to: "/user/contact" },
    ];
    if (role === "AGENT") return [
      { label: "Dashboard", to: "/agent/dashboard" },
      { label: "My Jobs", to: "/agent/jobs" },
      { label: "Notifications", to: "/agent/notifications" },
      { label: "Earnings", to: "/agent/earnings" },
      { label: "Profile", to: "/agent/profile" },
      { label: "Contact Us", to: "/agent/contact" },
    ];
    if (role === "ADMIN") return [
      { label: "Dashboard", to: "/admin/dashboard" },
      { label: "Orders", to: "/admin/orders" },
      { label: "Agents", to: "/admin/agents" },
      { label: "Categories", to: "/admin/categories" },
      { label: "Cities", to: "/admin/cities" },
      { label: "Services", to: "/admin/subservices" },
      { label: "Settlements", to: "/admin/settlements" },
      { label: "Settings", to: "/admin/settings" },
    ];
    return [];
  })();

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="px-4 lg:px-6">
        <div className="flex justify-between h-14 items-center">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 min-w-0">
              <img src="/logo.jpg" alt="SewaBuddy" className="w-7 h-7 sm:w-8 sm:h-8 rounded-md object-cover flex-shrink-0" />
              <span className="text-base sm:text-lg font-bold text-gray-900 tracking-tight truncate">Sewa<span className="text-amber-600">Buddy</span></span>
              <span className="hidden sm:inline text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">
                {role?.toLowerCase()}
              </span>
            </Link>

            {/* Desktop nav - hidden on mobile */}
            <div className="hidden md:flex items-center gap-0.5">
              {links.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
                    location.pathname === l.to
                      ? "bg-gray-900 text-white"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Desktop user info */}
          <div className="hidden md:flex items-center gap-3">
            <span className="text-xs text-gray-400">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50"
            >
              <LogOut size={14} /> Logout
            </button>
          </div>

          {/* Mobile logout button */}
          <button
            onClick={handleLogout}
            className="md:hidden flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
}
