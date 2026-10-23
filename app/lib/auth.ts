import NextAuth from "next-auth";
import credentials from "next-auth/providers/credentials";
import { verify as argon2Verify } from "@node-rs/argon2";
import { prisma } from "./prisma";

export const LOCKOUT_THRESHOLD = 10;
export const LOCKOUT_DURATION_MS = 15 * 60_000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)?.trim().toLowerCase();
        const password = credentials?.password as string | undefined;

        if (!email || !password) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          return null;
        }

        const now = new Date();
        if (user.lockedUntil && user.lockedUntil > now) {
          return null;
        }
        if (user.lockedUntil && user.lockedUntil <= now) {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedAttempts: 0, lockedUntil: null },
          });
          user.failedAttempts = 0;
          user.lockedUntil = null;
        }

        // Seed-created hashes are Argon2id PHC strings (Bun.password.hash
        // default), so verification must use Argon2id, not bcrypt.
        const isValid = await argon2Verify(user.passwordHash, password);
        if (!isValid) {
          await prisma.$transaction(async (tx) => {
            const updated = await tx.user.update({
              where: { id: user.id },
              data: { failedAttempts: { increment: 1 } },
              select: { failedAttempts: true },
            });
            if (updated.failedAttempts >= LOCKOUT_THRESHOLD) {
              await tx.user.update({
                where: { id: user.id },
                data: { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) },
              });
            }
          });
          return null;
        }

        if (user.failedAttempts > 0 || user.lockedUntil) {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedAttempts: 0, lockedUntil: null },
          });
        }

        return {
          id: user.id.toString(),
          name: user.fullName,
          email: user.email,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
      }
      return session;
    },
  },
});
