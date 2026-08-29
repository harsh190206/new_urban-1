import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../../../db/index.ts";
import { env } from "../../config/env.ts";
import {
  PhoneValidationError,
  resolveVerifiedPhone,
} from "./phone.controller.ts";
import { duplicateField } from "../../utils/prisma-errors.ts";

export async function registerUser(req: Request, res: Response): Promise<void> {
  const {
    email,
    password,
    name,
    address,
    pin,
    city,
    phone,
    phoneCountry,
    firebaseIdToken,
    profilepic,
  } = req.body as {
    email?: string;
    password?: string;
    name?: string;
    address?: string;
    pin?: string;
    city?: string;
    phone?: string;
    phoneCountry?: string;
    firebaseIdToken?: string;
    profilepic?: string;
  };

  if (!email || !password || !address || !pin || !phone) {
    res.status(400).json({
      message: "Required fields: email, password, address, pin, phone",
    });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ message: "Email is already registered" });
    return;
  }

  // Proves the number belongs to whoever is signing up, and that it is not
  // already taken. Throws with the status to return on any failure.
  let normalizedPhone: string;
  try {
    normalizedPhone = await resolveVerifiedPhone({
      phone,
      phoneCountry,
      firebaseIdToken,
      owner: "USER",
    });
  } catch (err) {
    if (err instanceof PhoneValidationError) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    throw err;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        ...(name && { name }),
        phone: normalizedPhone,
        ...(phoneCountry && { phoneCountry }),
        phoneVerified: true,
        ...(profilepic && { profilepic }),
        address: {
          create: {
            address,
            pin,
            ...(city && { city: city.trim().toLowerCase() }),
            label: "Home",
            isUser: true,
          },
        },
      },
      include: {
        address: true,
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

  const primaryAddress = user.address[0] ?? null;

  res.status(201).json({
    message: "Registration successful",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      address: primaryAddress?.address ?? null,
      pin: primaryAddress?.pin ?? null,
      city: primaryAddress?.city ?? null,
      addresses: user.address,
    },
  });
}

export async function loginUser(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { address: true },
  });
  if (!user) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: "USER" },
    env.JWT_USER_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );

  const primaryAddress = user.address[0] ?? null;

  res.status(200).json({
    message: "Login successful",
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      address: primaryAddress?.address ?? null,
      pin: primaryAddress?.pin ?? null,
      city: primaryAddress?.city ?? null,
      addresses: user.address,
    },
  });
}
