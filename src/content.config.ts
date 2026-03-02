import { glob } from "astro/loaders";
import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    terminalFilename: z.string().optional(),
    fileSize: z.string().optional(),
  }),
});

const projects = defineCollection({
  loader: glob({ base: "./src/content/projects", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    tech: z.array(z.string()),
    status: z.enum(["active", "archived", "wip"]),
    repoUrl: z.string().url().optional(),
    liveUrl: z.string().url().optional(),
    coverImage: z.string().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    featured: z.boolean().default(false),
    terminalFilename: z.string(),
    fileSize: z.string().optional(),
  }),
});

const experience = defineCollection({
  loader: glob({ base: "./src/content/experience", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    company: z.string(),
    role: z.string(),
    description: z.string(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    location: z.string().optional(),
    tech: z.array(z.string()).default([]),
    terminalFilename: z.string(),
    fileSize: z.string().optional(),
  }),
});

const education = defineCollection({
  loader: glob({ base: "./src/content/education", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    institution: z.string(),
    degree: z.string(),
    field: z.string(),
    description: z.string().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    terminalFilename: z.string(),
    fileSize: z.string().optional(),
  }),
});

const cv = defineCollection({
  loader: glob({ base: "./src/content/cv", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    updatedDate: z.coerce.date().optional(),
    fileSize: z.string().optional(),
  }),
});

export const collections = { blog, projects, experience, education, cv };
