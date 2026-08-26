import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import connectDb from "./mongodb";
import { User } from "./models";

const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;

if (!secret) {
  throw new Error("NEXTAUTH_SECRET must be set in environment variables");
}

export const authOptions: NextAuthOptions = {
  secret,
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = String(credentials.email).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
          return null;
        }

        await connectDb();

        const user = await User.findOne({ email }).lean();

        if (!user) {
          return null;
        }

        const isValid = await bcrypt.compare(String(credentials.password), user.password);

        if (!isValid) {
          return null;
        }

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = typeof token.id === "string" ? token.id : "";
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/login",
  },
};
