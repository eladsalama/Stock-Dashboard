import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";

export interface AuthUser {
  userId: string;
  email?: string;
  sub?: string;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const DEV_SHARED_SECRET = process.env.AUTH_DEV_SECRET || "dev-secret";

export default fp(async (app) => {
  function parseAuthHeader(req: FastifyRequest): AuthUser | undefined {
    const h = req.headers.authorization;
    if (!h) {
      req.log.debug("No authorization header");
      return undefined;
    }
    const [scheme, token] = h.split(" ");
    if (!token || scheme.toLowerCase() !== "bearer") {
      req.log.debug({ scheme, hasToken: !!token }, "Invalid auth format");
      return undefined;
    }
    try {
      if (token.startsWith("dev.")) {
        const base = token.slice(4);
        const obj = JSON.parse(Buffer.from(base, "base64url").toString("utf8"));
        const user = {
          userId: obj.userId || obj.sub || "dev-user",
          email: obj.email,
          sub: obj.sub,
        };
        req.log.debug({ user }, "Parsed dev token");
        return user;
      }
      const decoded = jwt.verify(token, DEV_SHARED_SECRET) as {
        userId?: string;
        sub?: string;
        email?: string;
      };
      const user = {
        userId: decoded.userId || decoded.sub || "user",
        email: decoded.email,
        sub: decoded.sub,
      };
      req.log.debug({ user }, "Parsed JWT token");
      return user;
    } catch (e) {
      req.log.debug({ error: e instanceof Error ? e.message : String(e) }, "Token parse failed");
      return undefined;
    }
  }

  app.decorate("requireAuth", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.authUser) {
      req.log.debug("Auth required but no authUser found");
      return reply.code(401).send({ error: "unauthorized" });
    }
    req.log.debug({ authUser: req.authUser }, "Auth check passed");
  });

  app.addHook("onRequest", async (req) => {
    const user = parseAuthHeader(req);
    if (user) req.authUser = user;
  });
});
