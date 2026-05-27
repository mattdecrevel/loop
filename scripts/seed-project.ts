import { db } from '@/lib/db';
import { projects, channels, routes } from '@/lib/db/schema';
import { generateApiKey, hashApiKey } from '@/lib/auth';
import { eq } from 'drizzle-orm';

// Usage: pnpm seed:project <slug> "<name>" [githubRepo]
const [slug, name, repo] = process.argv.slice(2);
if (!slug || !name) { console.error('usage: seed:project <slug> "<name>" [owner/repo]'); process.exit(1); }

const key = generateApiKey();
const [project] = await db.insert(projects).values({
  slug, name, apiKeyHash: hashApiKey(key), githubRepo: repo ?? null,
}).returning();

console.log(`Project ${slug} created.`);
console.log(`API KEY (store now, shown once): ${key}`);
console.log(`id: ${project.id}`);
process.exit(0);
