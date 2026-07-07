import { prisma, pool } from "./db/index.ts";
import bcrypt from "bcrypt";

async function seed() {
  console.log("Seeding dummy data...");

  // ── Admin ─────────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash("admin@123", 10);
  const admin = await prisma.admin.upsert({
    where: { email: "admin@sewabuddy.com" },
    update: {},
    create: {
      email: "admin@sewabuddy.com",
      password: adminPassword,
    },
  });
  console.log("Admin created:", admin.id, admin.email);

  // ── User ──────────────────────────────────────────────────────────────────
  const userPassword = await bcrypt.hash("user@123", 10);
  const user = await prisma.user.upsert({
    where: { email: "user@sewabuddy.com" },
    update: {},
    create: {
      email: "user@sewabuddy.com",
      password: userPassword,
      address: {
        create: {
          address: "12, MG Road, Bengaluru",
          pin: "560001",
          city: "Bengaluru",
          isUser: true,
        },
      },
    },
  });
  console.log("User created:", user.id, user.email);

  // ── Agent ─────────────────────────────────────────────────────────────────
  const agentPassword = await bcrypt.hash("agent@123", 10);
  const agent = await prisma.agent.upsert({
    where: { email: "agent@sewabuddy.com" },
    update: {
      isVerified: true,
      type: "plumber",
      id_proof: "https://example.com/seeded-id-proof.pdf",
      address_proof: "https://example.com/seeded-address-proof.pdf",
    },
    create: {
      email: "agent@sewabuddy.com",
      password: agentPassword,
      name: "Ravi Kumar",
      type: "plumber",
      isVerified: true,
      id_proof: "https://example.com/seeded-id-proof.pdf",
      address_proof: "https://example.com/seeded-address-proof.pdf",
      address: {
        create: {
          address: "45, Park Street, Kolkata",
          pin: "700001",
          city: "Kolkata",
          isUser: false,
        },
      },
    },
  });
  console.log("Agent created:", agent.id, agent.email);

  console.log("\nSeeding complete.");
  console.log("--------------------------------------");
  console.log("Login credentials:");
  console.log("  Admin  -> admin@sewabuddy.com  / admin@123");
  console.log("  User   -> user@sewabuddy.com   / user@123");
  console.log("  Agent  -> agent@sewabuddy.com  / agent@123");
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
