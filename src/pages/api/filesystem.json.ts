import { getCollection } from 'astro:content';

export const prerender = true;

export async function GET() {
  const projects = await getCollection('projects');
  const experience = await getCollection('experience');
  const education = await getCollection('education');
  const map: Record<string, string[]> = {
    '/': ['projects/', 'experience/', 'education/', 'bio.md', 'tech_stack.md', 'contact.md'],
    '/projects/': projects.map(p => p.data.terminalFilename),
    '/experience/': experience.map(e => e.data.terminalFilename),
    '/education/': education.map(e => e.data.terminalFilename),
    '/bio/': [],
    '/tech-stack/': [],
    '/contact/': [],
  };

  return new Response(JSON.stringify(map), {
    headers: { 'Content-Type': 'application/json' },
  });
}
