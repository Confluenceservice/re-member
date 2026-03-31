import type { APIRoute } from "astro";
import * as Sentry from "@sentry/node";
import { createApplicant, getApplicantByToken } from "../../../lib/applicant-store";
import { createApplicantRow, getUploadStatus, REQUIRED_DOC_TYPES } from "../../../lib/upload-sheet";
import { sendResumeLink } from "../../../lib/email-sender";
import { logger } from "../../../lib/logger";

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get("token");

  if (!token) {
    return Response.json({ status: "new" });
  }

  const applicant = await getApplicantByToken(token);

  if (!applicant) {
    return Response.json({ status: "new", error: "Invalid or expired link" });
  }

  if (applicant.paid) {
    return Response.json({
      status: "paid",
      fullName: applicant.fullName,
    });
  }

  const uploadStatus = await getUploadStatus(applicant.id);

  if (!uploadStatus) {
    return Response.json({ status: "error", error: "Application not found" });
  }

  const docsUploaded = REQUIRED_DOC_TYPES.filter(
    (type) => uploadStatus.docs[type]
  );

  const remaining = REQUIRED_DOC_TYPES.filter(
    (type) => !uploadStatus.docs[type]
  );

  return Response.json({
    status: docsUploaded.length === 7 ? "complete" : "partial",
    fullName: applicant.fullName,
    docsUploaded,
    remaining,
    complete: uploadStatus.complete,
  });
};

export const POST: APIRoute = async ({ request }) => {
  let payload: { fullName?: string; email?: string };

  try {
    payload = (await request.json()) as { fullName?: string; email?: string };
  } catch {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const fullName = payload.fullName?.trim();
  const email = payload.email?.trim().toLowerCase();

  if (!fullName) {
    return Response.json({ error: "Full name is required." }, { status: 400 });
  }

  if (!email) {
    return Response.json({ error: "Email is required." }, { status: 400 });
  }

  // Basic email validation
  if (!email.includes("@") || !email.includes(".")) {
    return Response.json({ error: "Valid email is required." }, { status: 400 });
  }

  try {
    const { applicant, resumeLink } = await createApplicant(fullName, email);

    // Create row in Google Sheet
    await createApplicantRow(applicant.id, fullName, email);

    // Send email with resume link
    try {
      await sendResumeLink(email, fullName, resumeLink);
      logger.info("resume_email_sent", { applicantId: applicant.id, email });
    } catch (emailError) {
      // Log but don't fail - the applicant can still complete their application
      logger.error("resume_email_failed", {
        applicantId: applicant.id,
        email,
        error: emailError instanceof Error ? emailError.message : "Unknown",
      });
      Sentry.captureMessage("Failed to send resume email", {
        extra: { applicantId: applicant.id, email },
      });
    }

    return Response.json({
      success: true,
      resumeLink,
      applicantId: applicant.id,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Sentry.captureException(error, { extra: { email, fullName } });
    logger.error("applicant_registration_failed", {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return Response.json(
      { error: "Failed to create application. Please try again." },
      { status: 500 }
    );
  }
};