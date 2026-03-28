import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "../_core/trpc";
import * as db from "../db";

const authorInput = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  bio: z.string().optional(),
  avatar: z.string().optional(),
  role: z.string().optional(),
  isActive: z.boolean().default(true),
});

const postInput = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  excerpt: z.string().optional(),
  content: z.string().optional(),
  coverImage: z.string().optional(),
  authorId: z.number().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  status: z.enum(["draft", "published", "scheduled"]).default("draft"),
  publishedAt: z.date().optional().nullable(),
  scheduledAt: z.date().optional().nullable(),
  readTime: z.number().optional(),
  sortOrder: z.number().int().default(0),
});

export const blogRouter = router({
  // Authors
  authors: router({
    list: adminProcedure
      .input(z.object({ activeOnly: z.boolean().optional() }).optional())
      .query(({ input }) => db.listBlogAuthors(input ?? undefined)),

    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getBlogAuthorById(input.id)),

    create: adminProcedure
      .input(authorInput)
      .mutation(({ input }) => db.createBlogAuthor(input)),

    update: adminProcedure
      .input(z.object({ id: z.number() }).merge(authorInput.partial()))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return db.updateBlogAuthor(id, data);
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteBlogAuthor(input.id)),
  }),

  // Posts
  posts: router({
    list: publicProcedure
      .input(z.object({
        status: z.enum(["draft", "published", "scheduled"]).optional(),
        limit: z.number().optional(),
      }).optional())
      .query(({ input, ctx }) => {
        const isAdmin = ctx.user?.role === "admin";
        const status = isAdmin ? input?.status : "published";
        return db.listBlogPosts({ ...input, status });
      }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const post = await db.getBlogPostById(input.id);
        if (post && post.status !== "published" && ctx.user?.role !== "admin") return null;
        return post;
      }),

    getBySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input, ctx }) => {
        const post = await db.getBlogPostBySlug(input.slug);
        if (post && post.status !== "published" && ctx.user?.role !== "admin") return null;
        return post;
      }),

    create: adminProcedure
      .input(postInput)
      .mutation(({ input }) => db.createBlogPost(input)),

    update: adminProcedure
      .input(z.object({ id: z.number() }).merge(postInput.partial()))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return db.updateBlogPost(id, data);
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteBlogPost(input.id)),
  }),
});
