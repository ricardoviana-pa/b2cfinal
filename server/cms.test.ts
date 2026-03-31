import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@portugalactive.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createAnonContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("CMS Admin Endpoints", () => {
  const adminCaller = appRouter.createCaller(createAdminContext());
  const userCaller = appRouter.createCaller(createUserContext());
  const anonCaller = appRouter.createCaller(createAnonContext());

  /* ================================================================
     SERVICES — Public list, admin CRUD
     ================================================================ */
  describe("services", () => {
    it("public can list services", async () => {
      const result = await anonCaller.services.list();
      expect(Array.isArray(result)).toBe(true);
    });

    it("non-admin cannot create a service", async () => {
      await expect(
        userCaller.services.create({
          name: "Test Service",
          slug: "test-service",
        })
      ).rejects.toThrow();
    });

    it("admin can create, list, and delete a service", async () => {
      const created = await adminCaller.services.create({
        name: "Test Chef Service",
        slug: "test-chef-service",
        category: "gastronomy",
        isActive: true,
      });
      expect(created).toHaveProperty("id");

      const list = await adminCaller.services.list();
      const found = list.find(
        (s: any) => s.slug === "test-chef-service"
      );
      expect(found).toBeDefined();

      // Cleanup
      if (found) {
        await adminCaller.services.delete({ id: found.id });
      }
    });
  });

  /* ================================================================
     REVIEWS — Public list, admin CRUD
     ================================================================ */
  describe("reviews", () => {
    it("public can list reviews", async () => {
      const result = await anonCaller.reviews.list();
      expect(Array.isArray(result)).toBe(true);
    });

    it("non-admin cannot create a review", async () => {
      await expect(
        userCaller.reviews.create({
          guestName: "Test Guest",
          quote: "Amazing stay!",
        })
      ).rejects.toThrow();
    });

    it("admin can create and delete a review", async () => {
      const created = await adminCaller.reviews.create({
        guestName: "Test Guest",
        guestLocation: "London, UK",
        quote: "Absolutely wonderful experience.",
        rating: 5,
      });
      expect(created).toHaveProperty("id");

      // Cleanup
      await adminCaller.reviews.delete({ id: created.id });
    });
  });

  /* ================================================================
     FAQS — Public list, admin CRUD
     ================================================================ */
  describe("faqs", () => {
    it("public can list faqs", async () => {
      const result = await anonCaller.faqs.list();
      expect(Array.isArray(result)).toBe(true);
    });

    it("admin can create and delete a faq", async () => {
      const created = await adminCaller.faqs.create({
        question: "Test question?",
        answer: "Test answer.",
        category: "general",
      });
      expect(created).toHaveProperty("id");

      await adminCaller.faqs.delete({ id: created.id });
    });
  });

  /* ================================================================
     LEADS — Public create, admin list + stats
     ================================================================ */
  describe("leads", () => {
    it("public can create a lead (newsletter signup)", async () => {
      const created = await anonCaller.leads.create({
        email: `test-${Date.now()}@example.com`,
        source: "newsletter",
      });
      expect(created).toHaveProperty("id");

      // Cleanup via admin
      await adminCaller.leads.delete({ id: created.id });
    });

    it("non-admin cannot list leads", async () => {
      await expect(userCaller.leads.list()).rejects.toThrow();
    });

    it("admin can list leads and get stats", async () => {
      const list = await adminCaller.leads.list();
      expect(Array.isArray(list)).toBe(true);

      const stats = await adminCaller.leads.stats();
      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("newsletter");
      expect(stats).toHaveProperty("contact");
      expect(stats).toHaveProperty("newLeads");
    });
  });

  /* ================================================================
     SETTINGS — Admin only
     ================================================================ */
  describe("settings", () => {
    it("admin can upsert and list settings", async () => {
      await adminCaller.settings.upsert({
        key: "test_setting",
        value: "test_value",
        category: "general",
      });

      const list = await adminCaller.settings.list();
      const found = list.find((s: any) => s.settingKey === "test_setting");
      expect(found).toBeDefined();
      expect(found?.settingValue).toBe("test_value");

      // Cleanup
      await adminCaller.settings.upsert({
        key: "test_setting",
        value: "",
        category: "general",
      });
    });

    it("public can get a specific setting", async () => {
      // First set it as admin
      await adminCaller.settings.upsert({
        key: "public_test",
        value: "hello",
      });

      const value = await anonCaller.settings.get({ key: "public_test" });
      expect(value).toBe("hello");

      // Cleanup
      await adminCaller.settings.upsert({
        key: "public_test",
        value: "",
      });
    });
  });

  /* ================================================================
     AUTH GUARD — Verify admin-only endpoints reject regular users
     ================================================================ */
  describe("auth guards", () => {
    it("rejects unauthenticated user from admin endpoints", async () => {
      await expect(anonCaller.leads.list()).rejects.toThrow();
      await expect(anonCaller.settings.list()).rejects.toThrow();
      await expect(
        anonCaller.services.create({ name: "x", slug: "x" })
      ).rejects.toThrow();
    });

    it("rejects regular user from admin endpoints", async () => {
      await expect(userCaller.leads.list()).rejects.toThrow();
      await expect(userCaller.settings.list()).rejects.toThrow();
      await expect(
        userCaller.reviews.create({ guestName: "x", quote: "x" })
      ).rejects.toThrow();
    });
  });
});
