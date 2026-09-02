import { useAuth } from "../context/AuthContext";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  User,
  Bell,
  Briefcase,
  DollarSign,
  LayoutDashboard,
  Package,
  Users,
  Grid3X3,
  HelpCircle,
} from "lucide-react";

type NavItem = {
  label: string;
  to: string;
  icon: React.ReactNode;
};

export default function BottomNav() {
  const { role, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) return null;

  const getLinks = (): NavItem[] => {
    if (role === "USER") {
      return [
        { label: "Home", to: "/user/home", icon: <Home size={20} /> },
        { label: "Profile", to: "/user/profile", icon: <User size={20} /> },
        { label: "Alerts", to: "/user/notifications", icon: <Bell size={20} /> },
        { label: "Help", to: "/user/contact", icon: <HelpCircle size={20} /> },
      ];
    }
    if (role === "AGENT") {
      return [
        { label: "Dashboard", to: "/agent/dashboard", icon: <LayoutDashboard size={20} /> },
        { label: "Jobs", to: "/agent/jobs", icon: <Briefcase size={20} /> },
        { label: "Earnings", to: "/agent/earnings", icon: <DollarSign size={20} /> },
        { label: "Profile", to: "/agent/profile", icon: <User size={20} /> },
        { label: "Help", to: "/agent/contact", icon: <HelpCircle size={20} /> },
      ];
    }
    if (role === "ADMIN") {
      return [
        { label: "Dashboard", to: "/admin/dashboard", icon: <LayoutDashboard size={20} /> },
        { label: "Orders", to: "/admin/orders", icon: <Package size={20} /> },
        { label: "Agents", to: "/admin/agents", icon: <Users size={20} /> },
        { label: "Categories", to: "/admin/categories", icon: <Grid3X3 size={20} /> },
        { label: "More", to: "/admin/more", icon: <Grid3X3 size={20} /> },
      ];
    }
    return [];
  };

  const links = getLinks();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom">
      <div className="flex justify-around items-center h-16 px-1">
        {links.map((item) => {
          const isActive =
            location.pathname === item.to ||
            (item.to !== "/" && location.pathname.startsWith(item.to));

          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center flex-1 py-2 px-1 transition-colors ${
                isActive
                  ? "text-amber-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className={isActive ? "text-amber-600" : "text-gray-400"}>
                {item.icon}
              </span>
              <span className={`text-[10px] mt-1 font-medium ${isActive ? "text-amber-600" : "text-gray-500"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
