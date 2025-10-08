import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
  name: z.string().min(1).max(100).optional(),
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const themeSchema = z.object({ theme: z.enum(["light", "dark"]) });
const googleLoginSchema = z.object({ idToken: z.string().min(10) });

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/auth/register", async (req, reply) => {
    const parse = registerSchema.safeParse(req.body);
    if (!parse.success)
      return reply.code(400).send({ error: "invalid", details: parse.error.flatten() });
    const { email, password, name } = parse.data;
    // Use findUnique then manual pick to avoid select errors if Prisma client not regenerated yet
    const existingRaw = await (app.prisma.user as any).findUnique({ where: { email } });
    const existing = existingRaw
      ? {
          id: existingRaw.id,
          email: existingRaw.email,
          passwordHash: existingRaw.passwordHash,
          themePreference: existingRaw.themePreference,
          name: existingRaw.name,
        }
      : null;
    if (existing && existing.passwordHash) return reply.code(409).send({ error: "email_in_use" });
    // Use imported bcrypt directly; dynamic import caused undefined hash on some builds
    const hash = await bcrypt.hash(password, 10);
    const user = existing
      ? await (app.prisma.user as any).update({
          where: { email },
          data: { passwordHash: hash, name: existing.name ?? name },
          select: { id: true, email: true, passwordHash: true, themePreference: true, name: true },
        })
      : await (app.prisma.user as any).create({
          data: { email, passwordHash: hash, name },
          select: { id: true, email: true, passwordHash: true, themePreference: true, name: true },
        });
    const payload = Buffer.from(
      JSON.stringify({ userId: user.id, email: user.email }),
      "utf8",
    ).toString("base64url");
    const token = "dev." + payload;
    return reply
      .code(201)
      .send({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          themePreference: user.themePreference,
        },
      });
  });

  app.post("/v1/auth/login", async (req, reply) => {
    const parse = loginSchema.safeParse(req.body);
    if (!parse.success)
      return reply.code(400).send({ error: "invalid", details: parse.error.flatten() });
    const { email, password } = parse.data;
    const userRaw = await (app.prisma.user as any).findUnique({ where: { email } });
    const user = userRaw
      ? {
          id: userRaw.id,
          email: userRaw.email,
          passwordHash: userRaw.passwordHash,
          themePreference: userRaw.themePreference,
          name: userRaw.name,
        }
      : null;
    if (!user || !user.passwordHash) return reply.code(401).send({ error: "invalid_credentials" });
    const ok = await bcrypt.compare(password, (user as any).passwordHash!);
    if (!ok) return reply.code(401).send({ error: "invalid_credentials" });
    const payload = Buffer.from(
      JSON.stringify({ userId: user.id, email: user.email }),
      "utf8",
    ).toString("base64url");
    const token = "dev." + payload;
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        themePreference: user.themePreference,
      },
    };
  });

  // Google OAuth login with proper ID token verification
  app.post("/v1/auth/google", async (req, reply) => {
    const parse = googleLoginSchema.safeParse(req.body);
    if (!parse.success)
      return reply.code(400).send({ error: "invalid", details: parse.error.flatten() });
    const { idToken } = parse.data;

    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      return reply.code(500).send({ error: "google_oauth_not_configured" });
    }

    let email: string | undefined;
    let name: string | undefined;
    let sub: string | undefined;

    try {
      // Verify the ID token with Google
      const client = new OAuth2Client(googleClientId);
      const ticket = await client.verifyIdToken({
        idToken,
        audience: googleClientId,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        return reply.code(401).send({ error: "invalid_google_token" });
      }

      email = payload.email;
      name = payload.name || payload.given_name || payload.family_name;
      sub = payload.sub;

      if (!email) {
        return reply.code(401).send({ error: "no_email_from_google" });
      }
    } catch (error) {
      app.log.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Google ID token verification failed",
      );
      return reply.code(401).send({ error: "invalid_google_token" });
    }

    // Find or create user
    const existing = await (app.prisma.user as any).findFirst({
      where: { OR: [{ googleSub: sub }, { email }] },
    });

    let user;
    if (existing) {
      // Update existing user with Google sub if not already set
      if (!existing.googleSub && sub) {
        const updated = await (app.prisma.user as any).update({
          where: { id: existing.id },
          data: { googleSub: sub, name: existing.name ?? name },
        });
        user = {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          themePreference: updated.themePreference,
        };
      } else {
        user = {
          id: existing.id,
          email: existing.email,
          name: existing.name,
          themePreference: existing.themePreference,
        };
      }
    } else {
      // Create new user
      const created = await (app.prisma.user as any).create({
        data: { email, googleSub: sub, name },
      });
      user = {
        id: created.id,
        email: created.email,
        name: created.name,
        themePreference: created.themePreference,
      };
    }

    const payload = Buffer.from(
      JSON.stringify({ userId: user.id, email: user.email }),
      "utf8",
    ).toString("base64url");
    const token = "dev." + payload;
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        themePreference: user.themePreference,
      },
    };
  });

  app.patch("/v1/user/theme", { preHandler: app.requireAuth }, async (req, reply) => {
    const parse = themeSchema.safeParse(req.body);
    if (!parse.success)
      return reply.code(400).send({ error: "invalid", details: parse.error.flatten() });
    const { theme } = parse.data;
    const updated = await (app.prisma.user as any).update({
      where: { id: req.authUser!.userId },
      data: { themePreference: theme },
      select: { themePreference: true },
    });
    return { ok: true, theme: updated.themePreference };
  });

  // Debug endpoint to check current auth status
  app.get("/v1/auth/me", { preHandler: app.requireAuth }, async (req) => {
    return {
      authUser: req.authUser,
      userId: req.authUser?.userId,
      email: req.authUser?.email,
    };
  });

  // Update user account
  const updateSchema = z.object({
    email: z.string().email().optional(),
    name: z.string().min(1).max(100).optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(6).max(200).optional(),
  });

  app.patch("/v1/user/update", { preHandler: app.requireAuth }, async (req, reply) => {
    const parse = updateSchema.safeParse(req.body);
    if (!parse.success)
      return reply.code(400).send({ error: "invalid", details: parse.error.flatten() });

    const { email, name, currentPassword, newPassword } = parse.data;
    const userId = req.authUser!.userId;

    // Get current user
    const userRaw = await (app.prisma.user as any).findUnique({ where: { id: userId } });
    const user = userRaw
      ? {
          id: userRaw.id,
          email: userRaw.email,
          passwordHash: userRaw.passwordHash,
          themePreference: userRaw.themePreference,
          name: userRaw.name,
        }
      : null;

    if (!user) return reply.code(404).send({ error: "user_not_found" });

    // If making changes, verify current password
    if ((email && email !== user.email) || name !== user.name || newPassword) {
      if (!currentPassword) {
        return reply.code(400).send({ error: "current_password_required" });
      }

      if (!user.passwordHash) {
        return reply.code(400).send({ error: "no_password_set" });
      }

      const passwordOk = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!passwordOk) {
        return reply.code(401).send({ error: "invalid_current_password" });
      }
    }

    // Prepare updates
    const updates: any = {};
    if (email && email !== user.email) updates.email = email;
    if (name !== user.name) updates.name = name;
    if (newPassword) updates.passwordHash = await bcrypt.hash(newPassword, 10);

    // Apply updates
    const updated = await (app.prisma.user as any).update({
      where: { id: userId },
      data: updates,
      select: { id: true, email: true, name: true, themePreference: true },
    });

    return {
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        themePreference: updated.themePreference,
      },
    };
  });
};

export default authRoutes;
