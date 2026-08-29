import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../../../db/index.ts";
import { env } from "../../config/env.ts";
import { cloudinary } from "../../config/cloudinary.ts";
import {
  PhoneValidationError,
  resolveVerifiedPhone,
} from "./phone.controller.ts";
import { duplicateField } from "../../utils/prisma-errors.ts";

// Helper: upload a buffer to Cloudinary and return the secure URL
function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
  publicId?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, resource_type: "image" },
      (error, result) => {
        if (error || !result)
          return reject(error ?? new Error("Upload failed"));
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}

export async function registerAgent(
  req: Request,
  res: Response,
): Promise<void> {
  const body = (req.body || {}) as {
    email?: string;
    password?: string;
    name?: string;
    type?: string;
    address?: string;
    pin?: string;
    city?: string;
    phone?: string;
    phoneCountry?: string;
    firebaseIdToken?: string;
    profilepic?: string;
    accountNumber?: string;
    holderName?: string;
    ifscCode?: string;
    bankName?: string;
    categoryIds?: string; // comma-separated or JSON array
  };
  const {
    email,
    password,
    name,
    type,
    address,
    pin,
    city,
    phone,
    phoneCountry,
    firebaseIdToken,
    profilepic,
    accountNumber,
    holderName,
    ifscCode,
    bankName,
  } = body;

  // Parse categoryIds from FormData (could be comma-separated string or JSON array)
  let categoryIds: number[] = [];
  if (body.categoryIds) {
    try {
      const parsed = JSON.parse(body.categoryIds);
      categoryIds = Array.isArray(parsed)
        ? parsed.map(Number)
        : [Number(parsed)];
    } catch {
      categoryIds = body.categoryIds
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n));
    }
  }

  // Get uploaded files
  const files = req.files as Express.Multer.File[] | undefined;

  // Process document files with doc_* field names
  // - legacy: doc_id_proof / doc_address_proof
  // - dynamic requirements: doc_<requirementId>
  const docFiles = new Map<string, Express.Multer.File>();
  const docByRequirementId = new Map<number, Express.Multer.File>();
  if (files) {
    files.forEach((file) => {
      if (file.fieldname.startsWith("doc_")) {
        docFiles.set(file.fieldname, file);

        const requirementId = Number(file.fieldname.replace(/^doc_/, ""));
        if (!Number.isNaN(requirementId)) {
          docByRequirementId.set(requirementId, file);
        }
      }
    });
  }

  if (!email || !password || !name || !address || !pin || !phone) {
    res.status(400).json({
      message: "Required fields: email, password, name, address, pin, phone",
    });
    return;
  }

  // Categories are optional at registration — agent can add them in step 2 onboarding

  // Bank details are optional during registration — agent can add later on profile
  const hasBankDetails = accountNumber && holderName && ifscCode && bankName;

  const existing = await prisma.agent.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ message: "Email is already registered" });
    return;
  }

  // Verified before the Cloudinary uploads below — a rejected signup must not
  // leave orphaned images behind or pay for uploads it will never use.
  let formattedPhone: string;
  try {
    formattedPhone = await resolveVerifiedPhone({
      phone,
      phoneCountry,
      firebaseIdToken,
      owner: "AGENT",
    });
  } catch (err) {
    if (err instanceof PhoneValidationError) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    throw err;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  // Upload proof images to Cloudinary (if provided)
  const docUrls = new Map<string, string>();
  const docUrlsByRequirementId = new Map<number, string>();
  const timestamp = Date.now();

  for (const [fieldname, file] of docFiles) {
    const docUrl = await uploadToCloudinary(
      file.buffer,
      "urban/agents/documents",
      `agent_${email.replace(/[^a-z0-9]/gi, "_")}_${fieldname}_${timestamp}`,
    );
    docUrls.set(fieldname, docUrl);
  }

  // Upload requirement docs (doc_<requirementId>)
  for (const [requirementId, file] of docByRequirementId) {
    const docUrl = await uploadToCloudinary(
      file.buffer,
      "urban/agents/documents",
      `agent_${email.replace(/[^a-z0-9]/gi, "_")}_requirement_${requirementId}_${timestamp}`,
    );
    docUrlsByRequirementId.set(requirementId, docUrl);
  }

  // If no categoryIds provided, try to map the legacy `type` to a category
  if (categoryIds.length === 0 && type) {
    const cat = await prisma.category.findFirst({
      where: { slug: type.trim().toLowerCase() },
    });
    if (cat) categoryIds = [cat.id];
  }

  let agent;
  try {
    agent = await prisma.agent.create({
      data: {
        email,
        password: hashedPassword,
        name,
        type: (type ?? categoryIds.length > 0) ? (type ?? "multi") : "general",
        phone: formattedPhone,
        ...(phoneCountry && { phoneCountry }),
        phoneVerified: true,
        ...(profilepic && { profilepic }),
        ...(docUrls.get("doc_id_proof") && {
          id_proof: docUrls.get("doc_id_proof"),
        }),
        ...(docUrls.get("doc_address_proof") && {
          address_proof: docUrls.get("doc_address_proof"),
        }),
        address: {
          create: {
            address,
            pin,
            ...(city && { city: city.trim().toLowerCase() }),
            isUser: false,
          },
        },
        ...(hasBankDetails && {
          bankDetails: {
            create: {
              accountNumber: accountNumber!,
              holderName: holderName!,
              ifscCode: ifscCode!,
              bankName: bankName!,
            },
          },
        }),
        ...(categoryIds.length > 0 && {
          categories: {
            create: categoryIds.map((catId) => ({
              categoryId: catId,
            })),
          },
        }),
      },
      include: {
        address: true,
        bankDetails: true,
        categories: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
  } catch (err) {
    // Two signups racing on the same email or number: the checks above both
    // passed, the unique index decides who wins.
    const duplicated = duplicateField(err);
    if (duplicated) {
      res.status(409).json({
        message:
          duplicated === "phone"
            ? "This phone number is already registered. Please login instead."
            : "Email is already registered",
      });
      return;
    }
    throw err;
  }

  // Save dynamic requirement documents so admin can review them.
  // Also replicate one uploaded document across same-name requirements
  // in the agent's selected categories.
  if (docUrlsByRequirementId.size > 0 && categoryIds.length > 0) {
    const uploadedRequirementIds = Array.from(docUrlsByRequirementId.keys());

    const uploadedRequirements = await prisma.documentRequirement.findMany({
      where: { id: { in: uploadedRequirementIds } },
      select: { id: true, name: true },
    });

    const uploadedByName = new Map<string, { id: number; url: string }>();
    for (const req of uploadedRequirements) {
      const key = req.name.trim().toLowerCase();
      const url = docUrlsByRequirementId.get(req.id);
      if (url && !uploadedByName.has(key)) {
        uploadedByName.set(key, { id: req.id, url });
      }
    }

    const categoryRequirements = await prisma.documentRequirement.findMany({
      where: { categoryId: { in: categoryIds } },
      select: { id: true, name: true },
    });

    const docsToCreate = new Map<number, string>();

    // Always include directly uploaded requirement ids
    for (const [rid, url] of docUrlsByRequirementId) {
      docsToCreate.set(rid, url);
    }

    // Reuse docs for same requirement name across selected categories
    for (const req of categoryRequirements) {
      const key = req.name.trim().toLowerCase();
      const uploaded = uploadedByName.get(key);
      if (uploaded && !docsToCreate.has(req.id)) {
        docsToCreate.set(req.id, uploaded.url);
      }
    }

    if (docsToCreate.size > 0) {
      await prisma.agentDocument.createMany({
        data: Array.from(docsToCreate.entries()).map(
          ([requirementId, url]) => ({
            agentId: agent.id,
            requirementId,
            url,
          }),
        ),
        skipDuplicates: true,
      });
    }
  }

  const primaryAddress = agent.address[0] ?? null;

  // Issue a JWT so the frontend can immediately continue as an authenticated agent
  const token = jwt.sign(
    { id: agent.id, email: agent.email, role: "AGENT" },
    env.JWT_AGENT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );

  res.status(201).json({
    message: "Agent registered successfully",
    token,
    agent: {
      id: agent.id,
      email: agent.email,
      name: agent.name,
      type: agent.type,
      phone: agent.phone,
      address: primaryAddress?.address ?? null,
      pin: primaryAddress?.pin ?? null,
      city: primaryAddress?.city ?? null,
      addresses: agent.address,
      isVerified: agent.isVerified,
      categories: agent.categories,
    },
  });
}

export async function loginAgent(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required" });
    return;
  }

  const agent = await prisma.agent.findUnique({
    where: { email },
    include: {
      address: true,
      categories: {
        include: { category: { select: { id: true, name: true, slug: true } } },
      },
    },
  });
  if (!agent) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const passwordMatch = await bcrypt.compare(password, agent.password);
  if (!passwordMatch) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  // Allow unverified agents to login — they see verification status on dashboard
  const token = jwt.sign(
    { id: agent.id, email: agent.email, role: "AGENT" },
    env.JWT_AGENT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );

  const primaryAddress = agent.address[0] ?? null;

  res.status(200).json({
    message: "Login successful",
    token,
    agent: {
      id: agent.id,
      email: agent.email,
      name: agent.name,
      type: agent.type,
      isVerified: agent.isVerified,
      isAvailable: agent.isAvailable,
      address: primaryAddress?.address ?? null,
      pin: primaryAddress?.pin ?? null,
      city: primaryAddress?.city ?? null,
      addresses: agent.address,
      categories: agent.categories,
    },
  });
}
