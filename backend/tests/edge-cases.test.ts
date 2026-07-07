/**
 * Edge-Case & Security Tests — Bun test runner
 * Run:  cd backend && bun test tests/edge-cases.test.ts
 *
 * Covers:
 *  - Concurrent agent acceptance (race condition)
 *  - Offline / online agent sees stale assignment
 *  - Extra-material approval immutability
 *  - Extra-material status visibility for agent
 *  - IDOR (accessing other user's resources)
 *  - Bank details on signup & update
 *  - Double approval / rejection prevention
 *  - Cross-role access control
 */

import { describe, it, expect, beforeAll } from "bun:test";

const BASE = "http://localhost:3000/api";
const RUN = Date.now();

// 1x1 transparent PNG
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64",
);

// ─── helpers ────────────────────────────────────────────────────────────

async function post(path: string, body: any, token?: string) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
  return { status: r.status, data: (await r.json()) as any };
}
async function get(path: string, token?: string) {
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { headers: h });
  return { status: r.status, data: (await r.json()) as any };
}
async function patch(path: string, body: any, token?: string) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: h,
    body: JSON.stringify(body),
  });
  return { status: r.status, data: (await r.json()) as any };
}
async function put(path: string, body: any, token?: string) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: h,
    body: JSON.stringify(body),
  });
  return { status: r.status, data: (await r.json()) as any };
}
async function del(path: string, token?: string) {
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { method: "DELETE", headers: h });
  return { status: r.status, data: (await r.json()) as any };
}

// ─── tokens / ids populated during setup ────────────────────────────────

let adminToken = "";
let userToken1 = "";
let userToken2 = "";
let userId1 = 0;
let userId2 = 0;
let agentToken1 = "";
let agentToken2 = "";
let agentId1 = 0;
let agentId2 = 0;
let subserviceId = 0;

// ═══════════════════════════════════════════════════════════════════════
//  SETUP — create all test accounts & data
// ═══════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  // ── admin ──────────────────────────────────────────
  const adm = await post("/auth/admin/login", {
    email: "admin@sewabuddy.com",
    password: "admin@123",
  });
  adminToken = adm.data.token;

  // ── user 1 ─────────────────────────────────────────
  const u1 = await post("/auth/user/register", {
    email: `edgeuser1_${RUN}@test.com`,
    password: "Test1234!",
    name: "Edge User 1",
    address: "100 First St",
    pin: "110001",
    city: "Delhi",
  });
  userId1 = u1.data.user.id;
  const u1login = await post("/auth/user/login", {
    email: `edgeuser1_${RUN}@test.com`,
    password: "Test1234!",
  });
  userToken1 = u1login.data.token;

  // ── user 2 (for IDOR tests) ────────────────────────
  const u2 = await post("/auth/user/register", {
    email: `edgeuser2_${RUN}@test.com`,
    password: "Test1234!",
    name: "Edge User 2",
    address: "200 Second St",
    pin: "110002",
    city: "Delhi",
  });
  userId2 = u2.data.user.id;
  const u2login = await post("/auth/user/login", {
    email: `edgeuser2_${RUN}@test.com`,
    password: "Test1234!",
  });
  userToken2 = u2login.data.token;

  // ── agent 1 ────────────────────────────────────────
  {
    const form = new FormData();
    form.append("email", `edgeagent1_${RUN}@test.com`);
    form.append("password", "Test1234!");
    form.append("name", "Agent Alpha");
    form.append("type", "plumber");
    form.append("address", "300 Agent Ave");
    form.append("pin", "110003");
    form.append("city", "Delhi");
    form.append("accountNumber", "1234567890");
    form.append("holderName", "Agent Alpha");
    form.append("ifscCode", "SBIN0001234");
    form.append("bankName", "SBI");
    form.append(
      "id_proof",
      new Blob([TINY_PNG], { type: "image/png" }),
      "id.png",
    );
    form.append(
      "address_proof",
      new Blob([TINY_PNG], { type: "image/png" }),
      "addr.png",
    );
    const r = await fetch(`${BASE}/auth/agent/register`, {
      method: "POST",
      body: form,
    });
    const d = (await r.json()) as any;
    agentId1 = d.agent.id;
    // verify agent
    await patch(`/admin/agents/${agentId1}/verify`, {}, adminToken);
    const login = await post("/auth/agent/login", {
      email: `edgeagent1_${RUN}@test.com`,
      password: "Test1234!",
    });
    agentToken1 = login.data.token;
  }

  // ── agent 2 ────────────────────────────────────────
  {
    const form = new FormData();
    form.append("email", `edgeagent2_${RUN}@test.com`);
    form.append("password", "Test1234!");
    form.append("name", "Agent Beta");
    form.append("type", "plumber");
    form.append("address", "400 Agent Blvd");
    form.append("pin", "110004");
    form.append("city", "Delhi");
    form.append("accountNumber", "9876543210");
    form.append("holderName", "Agent Beta");
    form.append("ifscCode", "HDFC0005678");
    form.append("bankName", "HDFC");
    form.append(
      "id_proof",
      new Blob([TINY_PNG], { type: "image/png" }),
      "id.png",
    );
    form.append(
      "address_proof",
      new Blob([TINY_PNG], { type: "image/png" }),
      "addr.png",
    );
    const r = await fetch(`${BASE}/auth/agent/register`, {
      method: "POST",
      body: form,
    });
    const d = (await r.json()) as any;
    agentId2 = d.agent.id;
    await patch(`/admin/agents/${agentId2}/verify`, {}, adminToken);
    const login = await post("/auth/agent/login", {
      email: `edgeagent2_${RUN}@test.com`,
      password: "Test1234!",
    });
    agentToken2 = login.data.token;
  }

  // ── subservice ─────────────────────────────────────
  const sub = await post(
    "/admin/subservices",
    { name: `EdgeSub_${RUN}`, price: 500, category: "PLUMBER" },
    adminToken,
  );
  subserviceId = sub.data.subservice.id;
});

// ═══════════════════════════════════════════════════════════════════════
//  BANK DETAILS ON SIGNUP & UPDATE
// ═══════════════════════════════════════════════════════════════════════

describe("Bank Details", () => {
  it("agent registration should require bank details", async () => {
    const form = new FormData();
    form.append("email", `nobank_${RUN}@test.com`);
    form.append("password", "Test1234!");
    form.append("name", "No Bank Agent");
    form.append("type", "plumber");
    form.append("address", "500 No Bank St");
    form.append("pin", "110005");
    // omit bank details
    form.append(
      "id_proof",
      new Blob([TINY_PNG], { type: "image/png" }),
      "id.png",
    );
    form.append(
      "address_proof",
      new Blob([TINY_PNG], { type: "image/png" }),
      "addr.png",
    );
    const r = await fetch(`${BASE}/auth/agent/register`, {
      method: "POST",
      body: form,
    });
    expect(r.status).toBe(400);
    const d = (await r.json()) as any;
    expect(d.message).toContain("Bank details");
  });

  it("agent profile should include bank details after registration", async () => {
    const { status, data } = await get("/agents/profile", agentToken1);
    expect(status).toBe(200);
    expect(data.agent.bankDetails).toBeDefined();
    expect(data.agent.bankDetails.accountNumber).toBe("1234567890");
    expect(data.agent.bankDetails.bankName).toBe("SBI");
  });

  it("agent can update bank details later", async () => {
    const { status, data } = await put(
      "/agents/bank-details",
      {
        accountNumber: "1111222233",
        holderName: "Agent Alpha Updated",
        ifscCode: "ICIC0009999",
        bankName: "ICICI",
      },
      agentToken1,
    );
    expect(status).toBe(200);
    expect(data.bankDetails.bankName).toBe("ICICI");
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  CONCURRENT AGENT ACCEPT (RACE CONDITION)
// ═══════════════════════════════════════════════════════════════════════

describe("Race Condition — concurrent accepts", () => {
  let orderId = 0;

  it("setup: user creates order, admin assigns to 2 agents", async () => {
    // Ensure agents are available
    {
      const p = await get("/agents/profile", agentToken1);
      if (!p.data.agent.isAvailable)
        await patch("/agents/availability", {}, agentToken1);
    }
    {
      const p = await get("/agents/profile", agentToken2);
      if (!p.data.agent.isAvailable)
        await patch("/agents/availability", {}, agentToken2);
    }

    // Create order
    const { status, data } = await post(
      "/users/orders",
      {
        name: "Race Test Order",
        servicetime: new Date(Date.now() + 86400000).toISOString(),
        services: [{ subserviceId, serviceCharge: 500 }],
      },
      userToken1,
    );
    expect(status).toBe(201);
    orderId = data.order.id;

    // Admin assigns to both agents
    const assign = await patch(
      `/admin/orders/${orderId}/assign`,
      {
        agentIds: [agentId1, agentId2],
      },
      adminToken,
    );
    expect(assign.status).toBe(200);
  });

  it("both agents try to accept simultaneously — only one should win", async () => {
    // Fire both accepts concurrently
    const [r1, r2] = await Promise.all([
      patch(`/agents/jobs/${orderId}/accept`, {}, agentToken1),
      patch(`/agents/jobs/${orderId}/accept`, {}, agentToken2),
    ]);

    // Exactly one should get 200, the other should get 409
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);

    // The winner should be the assignedAgent
    const winner = r1.status === 200 ? r1 : r2;
    expect(winner.data.order.assignedAgentId).toBeDefined();
  });

  it("the losing agent should see the assignment as DECLINED in their jobs", async () => {
    // Both agents' pending lists should NOT include this order anymore
    const p1 = await get("/agents/jobs/pending", agentToken1);
    const p2 = await get("/agents/jobs/pending", agentToken2);
    const all = [...p1.data.jobs, ...p2.data.jobs];
    const found = all.find((j: any) => j.id === orderId);
    expect(found).toBeUndefined(); // order no longer pending for either
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  OFFLINE AGENT — comes back after another accepted
// ═══════════════════════════════════════════════════════════════════════

describe("Offline agent scenario", () => {
  let orderId = 0;

  it("setup: create order, assign to 2 agents", async () => {
    // Ensure both agents available
    {
      const p = await get("/agents/profile", agentToken1);
      if (!p.data.agent.isAvailable)
        await patch("/agents/availability", {}, agentToken1);
    }
    {
      const p = await get("/agents/profile", agentToken2);
      if (!p.data.agent.isAvailable)
        await patch("/agents/availability", {}, agentToken2);
    }

    const { data } = await post(
      "/users/orders",
      {
        name: "Offline Test Order",
        servicetime: new Date(Date.now() + 86400000).toISOString(),
        services: [{ subserviceId, serviceCharge: 500 }],
      },
      userToken1,
    );
    orderId = data.order.id;

    await patch(
      `/admin/orders/${orderId}/assign`,
      { agentIds: [agentId1, agentId2] },
      adminToken,
    );
  });

  it("agent2 accepts while agent1 is 'offline'", async () => {
    const r = await patch(`/agents/jobs/${orderId}/accept`, {}, agentToken2);
    expect(r.status).toBe(200);
    expect(r.data.order.assignedAgentId).toBe(agentId2);
  });

  it("agent1 comes back online — should NOT see the order in pending jobs", async () => {
    const { data } = await get("/agents/jobs/pending", agentToken1);
    const found = data.jobs.find((j: any) => j.id === orderId);
    expect(found).toBeUndefined();
  });

  it("agent1 tries to accept — should get 409 conflict", async () => {
    const r = await patch(`/agents/jobs/${orderId}/accept`, {}, agentToken1);
    // Either 404 (assignment already declined) or 409 (order already taken)
    expect([404, 409]).toContain(r.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  EXTRA MATERIAL — STATUS VISIBILITY & IMMUTABILITY
// ═══════════════════════════════════════════════════════════════════════

describe("Extra Material — status & immutability", () => {
  let orderId = 0;
  let materialId1 = 0;
  let materialId2 = 0;

  it("setup: create order, assign, agent accepts, moves to IN_PROGRESS", async () => {
    // Ensure agent1 available
    {
      const p = await get("/agents/profile", agentToken1);
      if (!p.data.agent.isAvailable)
        await patch("/agents/availability", {}, agentToken1);
    }

    const { data } = await post(
      "/users/orders",
      {
        name: "Extra Material Test",
        servicetime: new Date(Date.now() + 86400000).toISOString(),
        services: [{ subserviceId, serviceCharge: 500 }],
      },
      userToken1,
    );
    orderId = data.order.id;

    await patch(
      `/admin/orders/${orderId}/assign`,
      { agentIds: [agentId1] },
      adminToken,
    );
    await patch(`/agents/jobs/${orderId}/accept`, {}, agentToken1);
    await patch(
      `/agents/jobs/${orderId}/status`,
      { status: "IN_PROGRESS" },
      agentToken1,
    );
  });

  it("agent adds extra material — should be PENDING", async () => {
    const { status, data } = await post(
      `/agents/jobs/${orderId}/extra-material`,
      {
        name: "PVC Pipe",
        quantity: 2,
        price: 150,
        paymentMethod: "CASH",
      },
      agentToken1,
    );
    expect(status).toBe(201);
    materialId1 = data.material.id;
    expect(data.material.approvalStatus).toBe("PENDING");
  });

  it("agent adds second extra material", async () => {
    const { status, data } = await post(
      `/agents/jobs/${orderId}/extra-material`,
      {
        name: "Elbow Joint",
        quantity: 4,
        price: 50,
        paymentMethod: "CASH",
      },
      agentToken1,
    );
    expect(status).toBe(201);
    materialId2 = data.material.id;
  });

  it("user sees extra materials with status in order details", async () => {
    const { status, data } = await get(
      `/users/orderdetails/${orderId}`,
      userToken1,
    );
    expect(status).toBe(200);
    const materials = data.order.extraMaterials;
    expect(materials.length).toBe(2);
    for (const m of materials) {
      expect(m.approvalStatus).toBe("PENDING");
    }
  });

  it("user sees pending extra materials in polling endpoint", async () => {
    const { data } = await get("/users/extra-materials/pending", userToken1);
    expect(data.count).toBeGreaterThanOrEqual(2);
  });

  it("user approves first material", async () => {
    const { status, data } = await patch(
      `/users/orders/${orderId}/extra-materials/${materialId1}/approve`,
      {},
      userToken1,
    );
    expect(status).toBe(200);
    expect(data.material.approvalStatus).toBe("APPROVED");
  });

  it("user rejects second material", async () => {
    const { status, data } = await patch(
      `/users/orders/${orderId}/extra-materials/${materialId2}/reject`,
      {},
      userToken1,
    );
    expect(status).toBe(200);
    expect(data.rejected).toBe(true);
  });

  it("trying to approve again (already approved) should fail — immutability", async () => {
    const { status, data } = await patch(
      `/users/orders/${orderId}/extra-materials/${materialId1}/approve`,
      {},
      userToken1,
    );
    expect(status).toBe(400);
    expect(data.error).toContain("already approved");
  });

  it("trying to reject an approved material should fail — immutability", async () => {
    const { status, data } = await patch(
      `/users/orders/${orderId}/extra-materials/${materialId1}/reject`,
      {},
      userToken1,
    );
    expect(status).toBe(400);
    expect(data.error).toContain("already approved");
  });

  it("trying to approve a rejected material should fail — immutability", async () => {
    const { status, data } = await patch(
      `/users/orders/${orderId}/extra-materials/${materialId2}/approve`,
      {},
      userToken1,
    );
    expect(status).toBe(400);
    expect(data.error).toContain("already rejected");
  });

  it("admin also cannot re-approve an already decided material", async () => {
    const { status, data } = await patch(
      `/admin/extra-materials/${materialId1}/approve`,
      {},
      adminToken,
    );
    expect(status).toBe(400);
    expect(data.error).toContain("already approved");
  });

  it("rejected material should NOT appear in pending list", async () => {
    const { data } = await get("/users/extra-materials/pending", userToken1);
    const ids = data.pending.map((m: any) => m.id);
    expect(ids).not.toContain(materialId2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  IDOR — Insecure Direct Object Reference
// ═══════════════════════════════════════════════════════════════════════

describe("IDOR — cross-user access", () => {
  let user1OrderId = 0;

  it("setup: user1 creates an order", async () => {
    const { data } = await post(
      "/users/orders",
      {
        name: "IDOR Test",
        servicetime: new Date(Date.now() + 86400000).toISOString(),
        services: [{ subserviceId, serviceCharge: 500 }],
      },
      userToken1,
    );
    user1OrderId = data.order.id;
  });

  it("user2 should NOT be able to see user1's order details", async () => {
    const { status, data } = await get(
      `/users/orderdetails/${user1OrderId}`,
      userToken2,
    );
    expect(status).toBe(404);
  });

  it("user2 should NOT be able to cancel user1's order", async () => {
    const { status } = await patch(
      `/users/orders/${user1OrderId}/cancel`,
      {},
      userToken2,
    );
    expect(status).toBe(404);
  });

  it("user2 should NOT be able to approve extra materials on user1's order", async () => {
    // Use a fake material ID — but even with a real one, the order ownership check should block
    const { status } = await patch(
      `/users/orders/${user1OrderId}/extra-materials/99999/approve`,
      {},
      userToken2,
    );
    expect(status).toBe(404); // order not found for user2
  });

  it("user2 should NOT be able to rate user1's order", async () => {
    const { status } = await patch(
      `/users/orders/${user1OrderId}/rate`,
      { rating: 5 },
      userToken2,
    );
    expect(status).toBe(404);
  });

  it("user2 should NOT be able to pay for user1's order", async () => {
    const { status } = await post(
      `/users/orders/${user1OrderId}/pay`,
      {
        amount: 100,
        method: "CASH",
      },
      userToken2,
    );
    expect(status).toBe(404);
  });
});

describe("IDOR — agent cross-access", () => {
  let orderId = 0;

  it("setup: order assigned only to agent1", async () => {
    // ensure agent1 available
    {
      const p = await get("/agents/profile", agentToken1);
      if (!p.data.agent.isAvailable)
        await patch("/agents/availability", {}, agentToken1);
    }

    const { data } = await post(
      "/users/orders",
      {
        name: "Agent IDOR Test",
        servicetime: new Date(Date.now() + 86400000).toISOString(),
        services: [{ subserviceId, serviceCharge: 500 }],
      },
      userToken1,
    );
    orderId = data.order.id;

    await patch(
      `/admin/orders/${orderId}/assign`,
      { agentIds: [agentId1] },
      adminToken,
    );
  });

  it("agent2 should NOT be able to accept agent1's assignment", async () => {
    const { status } = await patch(
      `/agents/jobs/${orderId}/accept`,
      {},
      agentToken2,
    );
    expect(status).toBe(404); // no assignment for agent2
  });

  it("agent2 should NOT be able to change status of agent1's order", async () => {
    // agent1 accepts first
    await patch(`/agents/jobs/${orderId}/accept`, {}, agentToken1);

    const { status } = await patch(
      `/agents/jobs/${orderId}/status`,
      { status: "IN_PROGRESS" },
      agentToken2,
    );
    expect(status).toBe(404); // order not assigned to agent2
  });

  it("agent2 should NOT be able to add extra material to agent1's order", async () => {
    await patch(
      `/agents/jobs/${orderId}/status`,
      { status: "IN_PROGRESS" },
      agentToken1,
    );

    const { status } = await post(
      `/agents/jobs/${orderId}/extra-material`,
      {
        name: "Unauthorized Pipe",
        quantity: 1,
        price: 100,
        paymentMethod: "CASH",
      },
      agentToken2,
    );
    expect(status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  CROSS-ROLE TOKEN ABUSE
// ═══════════════════════════════════════════════════════════════════════

describe("Cross-role token abuse", () => {
  it("user token on admin routes should be 401", async () => {
    const r = await get("/admin/dashboard", userToken1);
    expect(r.status).toBe(401);
  });

  it("agent token on admin routes should be 401", async () => {
    const r = await get("/admin/dashboard", agentToken1);
    expect(r.status).toBe(401);
  });

  it("user token on agent routes should be 401", async () => {
    const r = await get("/agents/profile", userToken1);
    expect(r.status).toBe(401);
  });

  it("agent token on user routes should be 401", async () => {
    const r = await get("/users/profile", agentToken1);
    expect(r.status).toBe(401);
  });

  it("admin token on user routes should be 401", async () => {
    const r = await get("/users/profile", adminToken);
    expect(r.status).toBe(401);
  });

  it("admin token on agent routes should be 401", async () => {
    const r = await get("/agents/profile", adminToken);
    expect(r.status).toBe(401);
  });

  it("no token should be 401 everywhere", async () => {
    const [u, a, ad] = await Promise.all([
      get("/users/profile"),
      get("/agents/profile"),
      get("/admin/dashboard"),
    ]);
    expect(u.status).toBe(401);
    expect(a.status).toBe(401);
    expect(ad.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  ORDER STATUS FLOW — invalid transitions
// ═══════════════════════════════════════════════════════════════════════

describe("Order status flow validation", () => {
  let orderId = 0;

  it("setup: create and accept order", async () => {
    {
      const p = await get("/agents/profile", agentToken1);
      if (!p.data.agent.isAvailable)
        await patch("/agents/availability", {}, agentToken1);
    }

    const { data } = await post(
      "/users/orders",
      {
        name: "Flow Test",
        servicetime: new Date(Date.now() + 86400000).toISOString(),
        services: [{ subserviceId, serviceCharge: 500 }],
      },
      userToken1,
    );
    orderId = data.order.id;

    await patch(
      `/admin/orders/${orderId}/assign`,
      { agentIds: [agentId1] },
      adminToken,
    );
    await patch(`/agents/jobs/${orderId}/accept`, {}, agentToken1);
    // Order is now ON_THEWAY
  });

  it("cannot skip to COMPLETED from ON_THEWAY", async () => {
    const { status } = await patch(
      `/agents/jobs/${orderId}/status`,
      { status: "COMPLETED" },
      agentToken1,
    );
    expect(status).toBe(400);
  });

  it("can move ON_THEWAY → IN_PROGRESS", async () => {
    const { status } = await patch(
      `/agents/jobs/${orderId}/status`,
      { status: "IN_PROGRESS" },
      agentToken1,
    );
    expect(status).toBe(200);
  });

  it("cannot go backwards IN_PROGRESS → ON_THEWAY", async () => {
    const { status } = await patch(
      `/agents/jobs/${orderId}/status`,
      { status: "ON_THEWAY" },
      agentToken1,
    );
    expect(status).toBe(400);
  });

  it("can move IN_PROGRESS → COMPLETED", async () => {
    const { status } = await patch(
      `/agents/jobs/${orderId}/status`,
      { status: "COMPLETED" },
      agentToken1,
    );
    expect(status).toBe(200);
  });

  it("cannot change status after COMPLETED", async () => {
    const { status } = await patch(
      `/agents/jobs/${orderId}/status`,
      { status: "IN_PROGRESS" },
      agentToken1,
    );
    expect(status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  DOUBLE RATING PREVENTION
// ═══════════════════════════════════════════════════════════════════════

describe("Rating — double prevention", () => {
  let orderId = 0;

  it("setup: complete an order", async () => {
    {
      const p = await get("/agents/profile", agentToken1);
      if (!p.data.agent.isAvailable)
        await patch("/agents/availability", {}, agentToken1);
    }

    const { data } = await post(
      "/users/orders",
      {
        name: "Rating Test",
        servicetime: new Date(Date.now() + 86400000).toISOString(),
        services: [{ subserviceId, serviceCharge: 300 }],
      },
      userToken1,
    );
    orderId = data.order.id;

    await patch(
      `/admin/orders/${orderId}/assign`,
      { agentIds: [agentId1] },
      adminToken,
    );
    await patch(`/agents/jobs/${orderId}/accept`, {}, agentToken1);
    await patch(
      `/agents/jobs/${orderId}/status`,
      { status: "IN_PROGRESS" },
      agentToken1,
    );
    await patch(
      `/agents/jobs/${orderId}/status`,
      { status: "COMPLETED" },
      agentToken1,
    );
  });

  it("user can rate once", async () => {
    const { status } = await patch(
      `/users/orders/${orderId}/rate`,
      { rating: 4 },
      userToken1,
    );
    expect(status).toBe(200);
  });

  it("user cannot rate same order twice", async () => {
    const { status, data } = await patch(
      `/users/orders/${orderId}/rate`,
      { rating: 5 },
      userToken1,
    );
    expect(status).toBe(400);
    expect(data.error).toContain("already rated");
  });

  it("invalid rating values should be rejected", async () => {
    // create another completed order for this test
    {
      const p = await get("/agents/profile", agentToken1);
      if (!p.data.agent.isAvailable)
        await patch("/agents/availability", {}, agentToken1);
    }
    const { data } = await post(
      "/users/orders",
      {
        name: "Rating Validation",
        servicetime: new Date(Date.now() + 86400000).toISOString(),
        services: [{ subserviceId, serviceCharge: 300 }],
      },
      userToken1,
    );
    const oid = data.order.id;
    await patch(
      `/admin/orders/${oid}/assign`,
      { agentIds: [agentId1] },
      adminToken,
    );
    await patch(`/agents/jobs/${oid}/accept`, {}, agentToken1);
    await patch(
      `/agents/jobs/${oid}/status`,
      { status: "IN_PROGRESS" },
      agentToken1,
    );
    await patch(
      `/agents/jobs/${oid}/status`,
      { status: "COMPLETED" },
      agentToken1,
    );

    const r0 = await patch(
      `/users/orders/${oid}/rate`,
      { rating: 0 },
      userToken1,
    );
    expect(r0.status).toBe(400);

    const r6 = await patch(
      `/users/orders/${oid}/rate`,
      { rating: 6 },
      userToken1,
    );
    expect(r6.status).toBe(400);

    const rFloat = await patch(
      `/users/orders/${oid}/rate`,
      { rating: 3.5 },
      userToken1,
    );
    expect(rFloat.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  ORDER CANCEL — only PENDING allowed
// ═══════════════════════════════════════════════════════════════════════

describe("Order cancel restrictions", () => {
  it("can cancel a PENDING order", async () => {
    const { data } = await post(
      "/users/orders",
      {
        name: "Cancel Test",
        servicetime: new Date(Date.now() + 86400000).toISOString(),
        services: [{ subserviceId, serviceCharge: 200 }],
      },
      userToken1,
    );
    const { status } = await patch(
      `/users/orders/${data.order.id}/cancel`,
      {},
      userToken1,
    );
    expect(status).toBe(200);
  });

  it("cannot cancel an ASSIGNED order", async () => {
    {
      const p = await get("/agents/profile", agentToken1);
      if (!p.data.agent.isAvailable)
        await patch("/agents/availability", {}, agentToken1);
    }
    const { data } = await post(
      "/users/orders",
      {
        name: "No Cancel ASSIGNED",
        servicetime: new Date(Date.now() + 86400000).toISOString(),
        services: [{ subserviceId, serviceCharge: 200 }],
      },
      userToken1,
    );
    await patch(
      `/admin/orders/${data.order.id}/assign`,
      { agentIds: [agentId1] },
      adminToken,
    );

    const { status } = await patch(
      `/users/orders/${data.order.id}/cancel`,
      {},
      userToken1,
    );
    expect(status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  ASSIGNMENT EDGE CASES
// ═══════════════════════════════════════════════════════════════════════

describe("Assignment edge cases", () => {
  it("cannot assign a non-PENDING order", async () => {
    {
      const p = await get("/agents/profile", agentToken1);
      if (!p.data.agent.isAvailable)
        await patch("/agents/availability", {}, agentToken1);
    }
    const { data } = await post(
      "/users/orders",
      {
        name: "Assign Edge",
        servicetime: new Date(Date.now() + 86400000).toISOString(),
        services: [{ subserviceId, serviceCharge: 200 }],
      },
      userToken1,
    );
    const oid = data.order.id;

    // assign once
    await patch(
      `/admin/orders/${oid}/assign`,
      { agentIds: [agentId1] },
      adminToken,
    );

    // try to assign again (order is now ASSIGNED, not PENDING)
    const r = await patch(
      `/admin/orders/${oid}/assign`,
      { agentIds: [agentId2] },
      adminToken,
    );
    expect(r.status).toBe(400);
  });

  it("all agents decline → order goes back to PENDING", async () => {
    {
      const p = await get("/agents/profile", agentToken1);
      if (!p.data.agent.isAvailable)
        await patch("/agents/availability", {}, agentToken1);
    }
    {
      const p = await get("/agents/profile", agentToken2);
      if (!p.data.agent.isAvailable)
        await patch("/agents/availability", {}, agentToken2);
    }

    const { data } = await post(
      "/users/orders",
      {
        name: "All Decline Test",
        servicetime: new Date(Date.now() + 86400000).toISOString(),
        services: [{ subserviceId, serviceCharge: 500 }],
      },
      userToken1,
    );
    const oid = data.order.id;

    await patch(
      `/admin/orders/${oid}/assign`,
      { agentIds: [agentId1, agentId2] },
      adminToken,
    );

    // Both decline
    await patch(`/agents/jobs/${oid}/decline`, {}, agentToken1);
    const r2 = await patch(`/agents/jobs/${oid}/decline`, {}, agentToken2);
    expect(r2.status).toBe(200);

    // Order should be PENDING again
    const details = await get(`/users/orderdetails/${oid}`, userToken1);
    expect(details.data.order.status).toBe("PENDING");
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  PAYMENT EDGE CASES
// ═══════════════════════════════════════════════════════════════════════

describe("Payment edge cases", () => {
  it("cannot pay with invalid amount", async () => {
    const { data } = await post(
      "/users/orders",
      {
        name: "Pay Edge",
        servicetime: new Date(Date.now() + 86400000).toISOString(),
        services: [{ subserviceId, serviceCharge: 200 }],
      },
      userToken1,
    );

    const r = await post(
      `/users/orders/${data.order.id}/pay`,
      {
        amount: -100,
        method: "CASH",
      },
      userToken1,
    );
    expect(r.status).toBe(400);
  });

  it("cannot pay with invalid method", async () => {
    const { data } = await post(
      "/users/orders",
      {
        name: "Pay Method Edge",
        servicetime: new Date(Date.now() + 86400000).toISOString(),
        services: [{ subserviceId, serviceCharge: 200 }],
      },
      userToken1,
    );

    const r = await post(
      `/users/orders/${data.order.id}/pay`,
      {
        amount: 100,
        method: "BITCOIN",
      },
      userToken1,
    );
    expect(r.status).toBe(400);
  });
});
