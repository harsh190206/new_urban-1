/**
 * Backend API Tests — uses Bun test runner
 * Run: cd backend && bun test
 */
import { describe, it, expect, beforeAll } from "bun:test";

const BASE = "http://localhost:3000/api";

// Unique emails per test run to avoid conflicts
const RUN_ID = Date.now();
const TEST_USER = {
  email: `testuser${RUN_ID}@test.com`,
  password: "Test1234!",
  name: "Test User",
  address: "123 Main St",
  pin: "110001",
  city: "Delhi",
};
const TEST_AGENT = {
  email: `testagent${RUN_ID}@test.com`,
  password: "Test1234!",
  name: "Test Agent",
  type: "PLUMBER",
  address: "456 Agent St",
  pin: "110002",
  city: "Delhi",
};
const TEST_ADMIN = {
  email: `testadmin${RUN_ID}@test.com`,
  password: "Test1234!",
};

// 1x1 transparent PNG for file upload tests
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64",
);

let userToken = "";
let agentToken = "";
let adminToken = "";
let userId = 0;
let agentId = 0;

// helper
async function post(path: string, body: any, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as any };
}

async function get(path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: "GET", headers });
  return { status: res.status, data: (await res.json()) as any };
}

async function patch(path: string, body: any, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as any };
}

async function put(path: string, body: any, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as any };
}

// ─────────── Health ───────────
describe("Health", () => {
  it("GET /health should return ok", async () => {
    const res = await fetch("http://localhost:3000/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe("ok");
  });
});

// ─────────── Auth ───────────
describe("Auth — User", () => {
  it("should reject registration with missing fields", async () => {
    const { status } = await post("/auth/user/register", { email: "x@y.com" });
    expect(status).toBe(400);
  });

  it("should register a new user", async () => {
    const { status, data } = await post("/auth/user/register", TEST_USER);
    expect(status).toBe(201);
    expect(data.user.email).toBe(TEST_USER.email);
    expect(data.user.name).toBe(TEST_USER.name);
    userId = data.user.id;
  });

  it("should reject duplicate registration", async () => {
    const { status } = await post("/auth/user/register", TEST_USER);
    expect(status).toBe(409);
  });

  it("should reject login with wrong password", async () => {
    const { status } = await post("/auth/user/login", {
      email: TEST_USER.email,
      password: "wrong",
    });
    expect(status).toBe(401);
  });

  it("should login user and return token", async () => {
    const { status, data } = await post("/auth/user/login", {
      email: TEST_USER.email,
      password: TEST_USER.password,
    });
    expect(status).toBe(200);
    expect(data.token).toBeDefined();
    userToken = data.token;
  });
});

describe("Auth — Agent", () => {
  it("should reject registration with missing fields", async () => {
    const form = new FormData();
    form.append("email", "a@b.com");
    const res = await fetch(`${BASE}/auth/agent/register`, {
      method: "POST",
      body: form,
    });
    expect(res.status).toBe(400);
  });

  it("should register a new agent", async () => {
    const form = new FormData();
    form.append("email", TEST_AGENT.email);
    form.append("password", TEST_AGENT.password);
    form.append("name", TEST_AGENT.name);
    form.append("type", TEST_AGENT.type);
    form.append("address", TEST_AGENT.address);
    form.append("pin", TEST_AGENT.pin);
    form.append("city", TEST_AGENT.city);
    form.append("accountNumber", "1234567890");
    form.append("holderName", TEST_AGENT.name);
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

    const res = await fetch(`${BASE}/auth/agent/register`, {
      method: "POST",
      body: form,
    });
    const data = (await res.json()) as any;
    expect(res.status).toBe(201);
    expect(data.agent.email).toBe(TEST_AGENT.email);
    agentId = data.agent.id;
  });

  it("should login agent", async () => {
    // The test agent needs to be verified first — verify via admin (admin is registered below,
    // so we use the seeded admin credentials for this)
    const adminLogin = await post("/auth/admin/login", {
      email: "admin@sewabuddy.com",
      password: "admin@123",
    });
    const tempAdminToken = adminLogin.data.token;
    await patch(`/admin/agents/${agentId}/verify`, {}, tempAdminToken);

    const { status, data } = await post("/auth/agent/login", {
      email: TEST_AGENT.email,
      password: TEST_AGENT.password,
    });
    expect(status).toBe(200);
    expect(data.token).toBeDefined();
    agentToken = data.token;
  });
});

describe("Auth — Admin", () => {
  it("should register a new admin", async () => {
    const { status, data } = await post("/auth/admin/register", TEST_ADMIN);
    expect(status).toBe(201);
    expect(data.admin.email).toBe(TEST_ADMIN.email);
  });

  it("should login admin", async () => {
    const { status, data } = await post("/auth/admin/login", {
      email: TEST_ADMIN.email,
      password: TEST_ADMIN.password,
    });
    expect(status).toBe(200);
    expect(data.token).toBeDefined();
    adminToken = data.token;
  });
});

// ─────────── Protected Routes — no token ───────────
describe("Auth guards", () => {
  it("should reject user routes without token", async () => {
    const { status } = await get("/users/profile");
    expect(status).toBe(401);
  });

  it("should reject agent routes without token", async () => {
    const { status } = await get("/agents/profile");
    expect(status).toBe(401);
  });

  it("should reject admin routes without token", async () => {
    const { status } = await get("/admin/dashboard");
    expect(status).toBe(401);
  });
});

// ─────────── User Endpoints ───────────
describe("User — Profile", () => {
  it("GET /users/profile should return user data", async () => {
    const { status, data } = await get("/users/profile", userToken);
    expect(status).toBe(200);
    expect(data.user.email).toBe(TEST_USER.email);
  });

  it("PUT /users/profile should update name", async () => {
    const { status, data } = await put(
      "/users/profile",
      { name: "Updated User" },
      userToken,
    );
    expect(status).toBe(200);
    expect(data.user.name).toBe("Updated User");
  });
});

describe("User — Notifications", () => {
  it("GET /users/notifications should return array", async () => {
    const { status, data } = await get("/users/notifications", userToken);
    expect(status).toBe(200);
    expect(Array.isArray(data.notifications)).toBe(true);
  });
});

describe("User — Orders (empty)", () => {
  it("GET /users/orders should return empty array for new user", async () => {
    const { status, data } = await get("/users/orders", userToken);
    expect(status).toBe(200);
    expect(Array.isArray(data.orderGroups || data.orders || data)).toBe(true);
  });
});

// ─────────── Agent Endpoints ───────────
describe("Agent — Profile", () => {
  it("GET /agents/profile should return agent data", async () => {
    const { status, data } = await get("/agents/profile", agentToken);
    expect(status).toBe(200);
    expect(data.agent.email).toBe(TEST_AGENT.email);
  });
});

describe("Agent — Availability", () => {
  it("PATCH /agents/availability should toggle availability", async () => {
    const { status, data } = await patch(
      "/agents/availability",
      {},
      agentToken,
    );
    expect(status).toBe(200);
    expect(typeof data.isAvailable).toBe("boolean");
  });
});

describe("Agent — Jobs", () => {
  it("GET /agents/jobs should return array", async () => {
    const { status, data } = await get("/agents/jobs", agentToken);
    expect(status).toBe(200);
    expect(Array.isArray(data.jobs || data.orders || data)).toBe(true);
  });

  it("GET /agents/jobs/pending should return array", async () => {
    const { status, data } = await get("/agents/jobs/pending", agentToken);
    expect(status).toBe(200);
    expect(Array.isArray(data.jobs || data.orders || data)).toBe(true);
  });
});

describe("Agent — Earnings", () => {
  it("GET /agents/earnings should return earnings data", async () => {
    const { status, data } = await get("/agents/earnings", agentToken);
    expect(status).toBe(200);
    expect(data).toBeDefined();
  });
});

// ─────────── Admin Endpoints ───────────
describe("Admin — Dashboard", () => {
  it("GET /admin/dashboard should return stats", async () => {
    const { status, data } = await get("/admin/dashboard", adminToken);
    expect(status).toBe(200);
    expect(data).toBeDefined();
  });
});

describe("Admin — Cities", () => {
  let cityId = 0;

  it("POST /admin/cities should create a city", async () => {
    const { status, data } = await post(
      "/admin/cities",
      { name: `TestCity${RUN_ID}` },
      adminToken,
    );
    expect(status).toBe(201);
    expect(data.city).toBeDefined();
    cityId = data.city.id;
  });

  it("GET /admin/cities should list cities", async () => {
    const { status, data } = await get("/admin/cities", adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(data.cities)).toBe(true);
    expect(data.cities.length).toBeGreaterThan(0);
  });

  it("PATCH /admin/cities/:id/toggle should toggle city", async () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    };
    const res = await fetch(`${BASE}/admin/cities/${cityId}/toggle`, {
      method: "PATCH",
      headers,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.city).toBeDefined();
  });
});

describe("Admin — Subservices", () => {
  let subId = 0;

  it("POST /admin/subservices should create a subservice", async () => {
    const { status, data } = await post(
      "/admin/subservices",
      {
        name: `TestSub${RUN_ID}`,
        price: 500,
        category: "PLUMBER",
      },
      adminToken,
    );
    expect(status).toBe(201);
    expect(data.subservice).toBeDefined();
    subId = data.subservice.id;
  });

  it("GET /admin/subservices should list subservices", async () => {
    const { status, data } = await get("/admin/subservices", adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(data.subservices)).toBe(true);
  });
});

describe("Admin — Agents list", () => {
  it("GET /admin/agents should list agents", async () => {
    const { status, data } = await get("/admin/agents", adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(data.agents)).toBe(true);
  });
});

describe("Admin — Orders", () => {
  it("GET /admin/orders should list orders", async () => {
    const { status, data } = await get("/admin/orders", adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(data.orders || data.orderGroups || data)).toBe(true);
  });
});

describe("Admin — Monthly Report", () => {
  it("GET /admin/reports/monthly should return report", async () => {
    const now = new Date();
    const { status, data } = await get(
      `/admin/reports/monthly?month=${now.getMonth() + 1}&year=${now.getFullYear()}`,
      adminToken,
    );
    expect(status).toBe(200);
    expect(data).toBeDefined();
  });
});

describe("Admin — Settlements", () => {
  it("GET /admin/settlements should return settlements", async () => {
    const now = new Date();
    const { status, data } = await get(
      `/admin/settlements?month=${now.getMonth() + 1}&year=${now.getFullYear()}`,
      adminToken,
    );
    expect(status).toBe(200);
    expect(data).toBeDefined();
  });
});

// ─────────── User — Subservices by category ───────────
describe("User — Subservices by category", () => {
  it("GET /users/subservices?category=PLUMBER should return subservices", async () => {
    const { status, data } = await get(
      "/users/subservices?category=PLUMBER",
      userToken,
    );
    expect(status).toBe(200);
    expect(Array.isArray(data.subservices)).toBe(true);
  });
});

// ─────────── Cross-role access ───────────
describe("Cross-role access prevention", () => {
  it("user token should not access admin routes", async () => {
    const { status } = await get("/admin/dashboard", userToken);
    expect(status).toBe(401);
  });

  it("agent token should not access admin routes", async () => {
    const { status } = await get("/admin/dashboard", agentToken);
    expect(status).toBe(401);
  });

  it("user token should not access agent routes", async () => {
    const { status } = await get("/agents/profile", userToken);
    expect(status).toBe(401);
  });
});
