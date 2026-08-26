import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectDb from "@/lib/mongodb";
import { User } from "@/lib/models";
import { getClientIdentifier, enforceRateLimit, logError, readJsonBody } from "@/lib/security";
import { registerSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const ip = getClientIdentifier(req);
    const limited = enforceRateLimit(`register:${ip}`, 5, 60_000);
    if (limited) return limited;

    const body = await readJsonBody(req, 32 * 1024);
    const result = registerSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    await connectDb();

    const { name, email, password } = result.data;

    const existing = await User.findOne({ email }).lean();

    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    return NextResponse.json(
      { message: "Account created successfully" },
      { status: 201 }
    );
  } catch (error) {
    logError("register", "Registration failed", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
