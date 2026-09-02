import { useEffect, useRef, useState } from "react";
import api from "../../api";
import toast from "react-hot-toast";
import {
  UserCheck, MapPin, Star, Briefcase, IndianRupee, X,
  CheckCircle, ChevronDown, ChevronUp, Users, Clock, CheckCheck, RefreshCw
} from "lucide-react";

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  ASSIGNED: "bg-blue-100 text-blue-800",
  ON_THEWAY: "bg-purple-100 text-purple-800",
  IN_PROGRESS: "bg-orange-100 text-orange-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

const assignmentStatusColors: Record<string, string> = {
  PENDING: "text-yellow-600 bg-yellow-50",
  ACCEPTED: "text-green-600 bg-green-50",
  DECLINED: "text-red-600 bg-red-50",
};

const getCategoryValue = (category: any): string | null => {
  if (!category) return null;
  if (typeof category === "string") return category;
  if (typeof category === "object") {
    if (typeof category.name === "string") return category.name;
    if (typeof category.slug === "string") return category.slug;
  }
  return null;
};

export default function AdminOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<Set<number>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = () => {
    setCooldownLeft(30);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldownLeft((p) => { if (p <= 1) { clearInterval(cooldownRef.current!); cooldownRef.current = null; return 0; } return p - 1; });
    }, 1000);
  };
  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    const q = statusFilter ? `?status=${statusFilter}` : "";
    Promise.all([
      api.get(`/admin/orders${q}`),
      api.get("/admin/agents?forAssignment=true"),
    ]).then(([o, a]) => { setOrders(o.data.orders); setAgents(a.data.agents); }).catch(() => {}).finally(() => { setRefreshing(false); startCooldown(); });
  };
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());

  const load = () => {
    const q = statusFilter ? `?status=${statusFilter}` : "";
    Promise.all([
      api.get(`/admin/orders${q}`),
      api.get("/admin/agents?forAssignment=true"),
    ]).then(([o, a]) => {
      setOrders(o.data.orders);
      setAgents(a.data.agents);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [statusFilter]);

  // Auto-refresh every 60s (silent — no loading spinner)
  useEffect(() => {
    const interval = setInterval(() => {
      const q = statusFilter ? `?status=${statusFilter}` : "";
      Promise.all([
        api.get(`/admin/orders${q}`),
        api.get("/admin/agents?forAssignment=true"),
      ]).then(([o, a]) => {
        setOrders(o.data.orders);
        setAgents(a.data.agents);
      }).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  const toggleExpand = (id: number) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAgent = (agentId: number) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      next.has(agentId) ? next.delete(agentId) : next.add(agentId);
      return next;
    });
  };

  const assign = async (orderId: number) => {
    if (selectedAgents.size === 0) { toast.error("Select at least one agent"); return; }
    try {
      await api.patch(`/admin/orders/${orderId}/assign`, { agentIds: Array.from(selectedAgents) });
      toast.success(`Order sent to ${selectedAgents.size} agent(s)!`);
      setAssigningId(null);
      setSelectedAgents(new Set());
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed");
    }
  };

  // Get the service category for an order (from its subservices)
  const getOrderCategory = (order: any): string | null => {
    const categories = (order.orders || [])
      .map((o: any) => getCategoryValue(o.subservice?.category))
      .filter(Boolean);
    // Return the dominant category (usually all same)
    return categories[0] || null;
  };

  // Filter agents by service category (verified) + availability, then sort by pincode match
  const getFilteredSortedAgents = (order: any) => {
    const orderPin = order.addressUser?.pin;
    const orderCity = order.addressUser?.city;

    // Collect all category IDs from the order's subservices
    const orderCategoryIds: number[] = [
      ...new Set<number>(
        (order.orders || [])
          .map((o: any) => o.subservice?.category?.id)
          .filter((id: any): id is number => id != null)
      ),
    ];

    // Only show available and verified agents
    let available = agents.filter((a) => a.isAvailable && a.isVerified);

    // Filter by agents who are VERIFIED for the order's category (compare by ID)
    if (orderCategoryIds.length > 0) {
      available = available.filter((a) =>
        a.categories?.some(
          (ac: any) => ac.isVerified && orderCategoryIds.includes(ac.category?.id)
        )
      );
    }

    // Sort: same pin first, then same city, then by rating
    return [...available].sort((a, b) => {
      const aPins = (a.address || []).map((addr: any) => addr.pin);
      const bPins = (b.address || []).map((addr: any) => addr.pin);
      const aCities = (a.address || []).map((addr: any) => addr.city?.toLowerCase());
      const bCities = (b.address || []).map((addr: any) => addr.city?.toLowerCase());

      const aPinMatch = orderPin && aPins.includes(orderPin) ? 1 : 0;
      const bPinMatch = orderPin && bPins.includes(orderPin) ? 1 : 0;
      if (aPinMatch !== bPinMatch) return bPinMatch - aPinMatch;

      const aCityMatch = orderCity && aCities.includes(orderCity.toLowerCase()) ? 1 : 0;
      const bCityMatch = orderCity && bCities.includes(orderCity.toLowerCase()) ? 1 : 0;
      if (aCityMatch !== bCityMatch) return bCityMatch - aCityMatch;

      return (b.rating ?? 0) - (a.rating ?? 0);
    });
  };

  const isPinMatch = (agent: any, orderPin?: string) => {
    if (!orderPin) return false;
    return (agent.address || []).some((addr: any) => addr.pin === orderPin);
  };

  const isCityMatch = (agent: any, orderCity?: string) => {
    if (!orderCity) return false;
    return (agent.address || []).some((addr: any) => addr.city?.toLowerCase() === orderCity.toLowerCase());
  };

  return (
    <div className="px-4 lg:px-6 py-4 pb-20 md:pb-6">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-semibold text-gray-900">All Orders</h1>
        <button onClick={handleRefresh} disabled={refreshing || cooldownLeft > 0}
          className={`p-1.5 rounded-md transition flex items-center gap-1 ${refreshing ? "text-gray-500" : cooldownLeft > 0 ? "text-gray-300 cursor-not-allowed" : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"}`} title={refreshing ? "Refreshing…" : cooldownLeft > 0 ? `Wait ${cooldownLeft}s` : "Refresh"}>
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          {cooldownLeft > 0 && !refreshing && <span className="text-[10px] font-medium text-gray-400">{cooldownLeft}s</span>}
        </button>
      </div>

      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {["", "PENDING", "ASSIGNED", "ON_THEWAY", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((s) => (
          <button key={s} onClick={() => { setStatusFilter(s); setLoading(true); }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition ${
              statusFilter === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}>
            {s || "All"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : orders.length === 0 ? (
        <p className="text-gray-400 text-center py-8 bg-white rounded-lg border text-sm">No orders found</p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const isExpanded = expandedOrders.has(order.id);
            const orderCategory = getOrderCategory(order);
            return (
              <div key={order.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                {/* Order Header */}
                <div className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <p className="font-semibold text-sm text-gray-900">#{order.id}</p>
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${statusColors[order.status]}`}>
                          {order.status.replace("_", " ")}
                        </span>
                        {orderCategory && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            orderCategory.toLowerCase() === "plumber" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
                          }`}>
                            {orderCategory}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{order.user?.email}</p>
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                        <MapPin size={11} className="text-gray-400 shrink-0" />
                        <span className="truncate">{order.addressUser?.address}, {order.addressUser?.city}</span>
                        {order.addressUser?.pin && (
                          <span className="ml-1 px-1 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-mono shrink-0">{order.addressUser.pin}</span>
                        )}
                      </div>
                      {order.servicetime && (
                        <p className="text-[11px] text-amber-600 mt-0.5 flex items-center gap-1">
                          <Clock size={10} /> {new Date(order.servicetime).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex flex-col items-end gap-1 shrink-0 ml-3">
                      <p className="font-bold text-sm text-gray-900">₹{order.totalPrice ?? 0}</p>
                      {order.agent && (
                        <p className="text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <CheckCheck size={10} /> {order.agent.name}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Services */}
                  <button onClick={() => toggleExpand(order.id)}
                    className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 mt-2 transition">
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {order.orders?.length ?? 0} service(s)
                  </button>
                  {isExpanded && order.orders?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(() => {
                        const grouped = (order.orders || []).reduce((acc: any[], o: any) => {
                          const existing = acc.find((g: any) => g.name === o.subservice?.name);
                          const qty = o.subservice?.price ? Math.round(o.serviceCharge / o.subservice.price) : 1;
                          if (existing) { existing.qty += qty; existing.total += (o.serviceCharge || 0); }
                          else acc.push({ name: o.subservice?.name, qty, total: o.serviceCharge || 0 });
                          return acc;
                        }, []);
                        return grouped.map((g: any, i: number) => (
                          <span key={i} className="text-[11px] bg-gray-50 border border-gray-100 rounded px-2 py-1 text-gray-600">
                            {g.name}{g.qty > 1 ? ` × ${g.qty}` : ""} <span className="text-gray-400">₹{g.total}</span>
                          </span>
                        ));
                      })()}
                    </div>
                  )}

                  {/* Assignment status badges for ASSIGNED orders */}
                  {order.status === "ASSIGNED" && order.assignments?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-[11px] font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                        <Users size={11} /> Assigned to {order.assignments.length} agent(s)
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {order.assignments.map((a: any) => (
                          <span key={a.id}
                            className={`inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded font-medium ${assignmentStatusColors[a.status]}`}>
                            {a.status === "PENDING" && <Clock size={10} />}
                            {a.status === "ACCEPTED" && <CheckCircle size={10} />}
                            {a.status === "DECLINED" && <X size={10} />}
                            {a.agent?.name} — {a.status}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Agent Assignment Panel */}
                {order.status === "PENDING" && (
                  <div className="border-t border-gray-100">
                    {assigningId === order.id ? (
                      <div className="p-4 bg-gray-50/80">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h3 className="text-xs font-semibold text-gray-700">
                              Select Agents to Assign
                            </h3>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {orderCategory ? `${orderCategory.toLowerCase()}s only` : "All agents"} · first to accept gets the job
                            </p>
                          </div>
                          <button onClick={() => { setAssigningId(null); setSelectedAgents(new Set()); }}
                            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-200 transition">
                            <X size={16} />
                          </button>
                        </div>

                        {/* Select All */}
                        {(() => {
                          const filtered = getFilteredSortedAgents(order);
                          const allSelected = filtered.length > 0 && filtered.every((a) => selectedAgents.has(a.id));
                          return filtered.length > 0 && (
                            <button onClick={() => {
                              if (allSelected) {
                                setSelectedAgents(new Set());
                              } else {
                                setSelectedAgents(new Set(filtered.map((a) => a.id)));
                              }
                            }}
                              className="text-[11px] text-blue-600 hover:text-blue-700 font-medium mb-2 flex items-center gap-0.5">
                              <CheckCircle size={11} />
                              {allSelected ? "Deselect All" : `Select All (${filtered.length})`}
                            </button>
                          );
                        })()}

                        {/* Agent Cards Grid */}
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {getFilteredSortedAgents(order).map((agent) => {
                            const pinMatch = isPinMatch(agent, order.addressUser?.pin);
                            const cityMatch = isCityMatch(agent, order.addressUser?.city);
                            const isSelected = selectedAgents.has(agent.id);

                            return (
                              <div key={agent.id}
                                onClick={() => toggleAgent(agent.id)}
                                className={`relative rounded-lg border p-3 cursor-pointer transition-all ${
                                  isSelected
                                    ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-200"
                                    : "border-gray-200 bg-white hover:border-gray-300"
                                }`}>
                                {/* Match badges */}
                                {pinMatch && (
                                  <span className="absolute -top-1.5 -right-1.5 bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                                    PIN match
                                  </span>
                                )}
                                {!pinMatch && cityMatch && (
                                  <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                                    City match
                                  </span>
                                )}

                                {isSelected && (
                                  <CheckCircle size={16} className="absolute top-2 right-2 text-blue-500" />
                                )}

                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 bg-gray-700">
                                    {agent.name?.charAt(0)?.toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium text-gray-900 text-xs truncate">{agent.name}</p>
                                    <p className="text-[10px] text-gray-500 truncate">{agent.email}</p>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {(agent.categories || []).filter((ac: any) => ac.isVerified).map((ac: any) => (
                                        <span key={ac.id} className="inline-block text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-700 capitalize">
                                          {ac.category?.name}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 text-[11px] text-gray-500">
                                  <span className="flex items-center gap-0.5">
                                    <Star size={10} className="text-amber-400 fill-amber-400" /> {agent.rating ?? 0}
                                  </span>
                                  <span className="flex items-center gap-0.5">
                                    <Briefcase size={10} /> {agent._count?.orders ?? 0}
                                  </span>
                                  <span className="flex items-center gap-0.5">
                                    <IndianRupee size={10} className="text-green-500" /> {(agent.totalEarnings ?? 0).toLocaleString("en-IN")}
                                  </span>
                                </div>

                                {(agent.address || []).map((addr: any, i: number) => (
                                  <div key={i} className="mt-1.5 flex items-start gap-1">
                                    <MapPin size={10} className={`mt-0.5 shrink-0 ${pinMatch ? "text-green-500" : "text-gray-300"}`} />
                                    <p className="text-[10px] text-gray-500 leading-snug">
                                      <span className="capitalize">{addr.city || "—"}</span>
                                      {addr.pin && (
                                        <span className={`ml-1 px-1 rounded text-[9px] font-mono ${
                                          order.addressUser?.pin === addr.pin
                                            ? "bg-green-100 text-green-700 font-semibold"
                                            : "bg-gray-100 text-gray-500"
                                        }`}>{addr.pin}</span>
                                      )}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>

                        {getFilteredSortedAgents(order).length === 0 && (
                          <p className="text-center text-gray-400 py-4 text-xs">
                            No available {orderCategory?.toLowerCase() || ""} agents
                          </p>
                        )}

                        {selectedAgents.size > 0 && (
                          <div className="mt-3 flex items-center justify-between">
                            <p className="text-xs text-gray-500">
                              <span className="font-semibold text-blue-600">{selectedAgents.size}</span> selected
                            </p>
                            <button onClick={() => assign(order.id)}
                              className="bg-gray-900 text-white px-4 py-2 rounded-full text-xs font-semibold hover:bg-gray-800 active:scale-[0.97] transition-all flex items-center gap-1.5 shadow-sm">
                              <Users size={14} />
                              Send to {selectedAgents.size} Agent{selectedAgents.size > 1 ? "s" : ""}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="px-4 py-2.5">
                        <button onClick={() => { setAssigningId(order.id); setSelectedAgents(new Set()); }}
                          className="bg-gray-900 text-white px-4 py-2 rounded-full text-xs font-semibold hover:bg-gray-800 active:scale-[0.97] flex items-center gap-1.5 transition-all shadow-sm">
                          <UserCheck size={14} /> Assign Agents
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
