import { compare } from "bcryptjs";
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

import { CRMPrismaAdapter } from "@/lib/auth-adapter";
import { prisma } from "@/lib/prisma";
import { registrationSchema } from "@/lib/validations/registration";

const credentialsSchema = registrationSchema.pick({ email: true, password: true });

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: CRMPrismaAdapter(),
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          select: { id: true, name: true, email: true, passwordHash: true, role: true, avatarUrl: true },
        });
        if (!user?.passwordHash || !(await compare(parsed.data.password, user.passwordHash))) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatarUrl: user.avatarUrl,
          image: user.avatarUrl,
        };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider === "google") {
        return profile?.email_verified === true && typeof profile.email === "string";
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.avatarUrl = user.avatarUrl ?? user.image ?? null;
      }
      // Tokens issued before these claims were configured must sign in again.
      if (!token.id || !token.role) return null;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.avatarUrl = token.avatarUrl;
      session.user.image = token.avatarUrl;
      return session;
    },
  },
});
