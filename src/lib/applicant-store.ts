import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = '.data';
const APPLICANTS_FILE = 'applicants.json';

export interface Applicant {
  id: string;
  email: string;
  fullName: string;
  resumeToken: string;
  createdAt: string;
  paid: boolean;
  stripeSessionId?: string;
}

interface ApplicantsStore {
  byId: Record<string, Applicant>;
  byToken: Record<string, string>; // token -> applicant id
}

async function getStore(): Promise<ApplicantsStore> {
  const filePath = path.join(DATA_DIR, APPLICANTS_FILE);
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { byId: {}, byToken: {} };
  }
}

async function saveStore(store: ApplicantsStore): Promise<void> {
  const filePath = path.join(DATA_DIR, APPLICANTS_FILE);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2));
}

export async function createApplicant(
  fullName: string,
  email: string
): Promise<{ applicant: Applicant; resumeLink: string }> {
  const store = await getStore();

  const applicant: Applicant = {
    id: crypto.randomUUID(),
    email: email.toLowerCase().trim(),
    fullName,
    resumeToken: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    paid: false,
  };

  store.byId[applicant.id] = applicant;
  store.byToken[applicant.resumeToken] = applicant.id;

  await saveStore(store);

  const baseUrl = process.env.PUBLIC_SITE_URL || 'https://eldaa.org.nz';
  const resumeLink = `${baseUrl}/professional/apply?token=${applicant.resumeToken}`;

  return { applicant, resumeLink };
}

export async function getApplicantByToken(
  token: string
): Promise<Applicant | null> {
  const store = await getStore();
  const applicantId = store.byToken[token];
  if (!applicantId) return null;
  return store.byId[applicantId] || null;
}

export async function getApplicantById(id: string): Promise<Applicant | null> {
  const store = await getStore();
  return store.byId[id] || null;
}

export async function markApplicantPaid(
  id: string,
  stripeSessionId: string
): Promise<boolean> {
  const store = await getStore();
  const applicant = store.byId[id];
  if (!applicant) return false;

  applicant.paid = true;
  applicant.stripeSessionId = stripeSessionId;
  await saveStore(store);
  return true;
}

export async function getApplicantByEmail(
  email: string
): Promise<Applicant | null> {
  const store = await getStore();
  const normalizedEmail = email.toLowerCase().trim();
  for (const applicant of Object.values(store.byId)) {
    if (applicant.email === normalizedEmail) {
      return applicant;
    }
  }
  return null;
}