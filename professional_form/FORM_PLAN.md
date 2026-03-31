# Professional Membership Upload & Payment System

**Date:** 2026-03-30
**Status:** Draft for review

---

## Overview

Allow Professional Membership applicants to upload required documentation before proceeding to Stripe payment. The system gates payment until all documents are confirmed, supports multi-session (applicants return over days/weeks), and treats all applicant data as sensitive.

---

## Required Documents

| Document | Notes |
|----------|-------|
| Application form | Completed PM application form |
| Certificates of training | Evidence of completed training |
| Signed ELDAA Code of Ethics and Scope of Practice | Signed document |
| Criminal records check | Background check |
| Advanced Care Planning (NZ) | 4 modules |
| Assisted Dying online training | 3 modules |
| Fundamentals of Palliative Care | 4 modules (Hospice NZ online) |

---

## Security Architecture

### Key Principle
Email alone is never sufficient to access anything. Files are opaque blobs.

### Data Separation

| Storage | What's stored | Email present? |
|---------|---------------|-----------------|
| Google Sheet | `applicant_id`, `doc_types_uploaded[]`, `complete`, `stripe_session`, `paid` | **No** |
| Server-side JSON (`.data/applicants.json`) | `applicant_id → email` mapping | **Yes** (encrypted at rest) |
| Google Drive | `/applications/{uuid}/{doc_type}/{random_filename}` | **No** |

### File Storage Rules
- Files stored under UUID paths, no email identifiers
- Original filenames NOT preserved — random filenames assigned
- Drive folder not publicly accessible
- No admin interface to view files (out of scope)

---

## Applicant Flow

### First Visit
1. Visit `/professional/apply` (no token in URL)
2. Server generates:
   - `applicant_id` (UUID v4)
   - `resume_token` (UUID v4)
3. Show registration form (name + email)

### Registration
1. Applicant enters: full name, email
2. Server:
   - Stores mapping: `applicant_id → email + resume_token` in server-side JSON
   - Creates Drive folder: `/applications/{applicant_id}/`
   - Adds row to Google Sheet: `applicant_id`, `email_hash`, `full_name`, all doc columns empty
3. **Send email** with resume link: `eldaa.org.nz/professional/apply?token={resume_token}`
4. Show document upload interface

### Document Upload
1. Applicant selects and uploads required documents
2. Each file uploaded to: `/applications/{applicant_id}/{doc_type}/{random_uuid}`
3. Sheet updated: `doc_type` column = timestamp
4. UI shows progress: "3 of 7 documents uploaded"

### Return Visit (resume)
1. Applicant opens resume link (token in URL query param)
2. Server looks up token → finds `applicant_id`
3. Show "Welcome back — 3 of 7 documents uploaded"
4. Applicant uploads remaining documents
5. No email entry required on return

### All Documents Uploaded → Payment
1. Server detects all 7 document types present
2. "Continue to payment" button appears
3. Server creates Stripe Checkout Session (same as existing flow)
4. Applicant pays → webhook confirms → sheet updated to `paid: true`
5. Success page shown

---

## Session Management

**Resume Link** — no cookies, URL token is the session.

- **Token:** `resume_token` (UUID v4)
- **Lifetime:** 30 days (or until payment complete)
- **Storage:** Server-side JSON maps `resume_token → applicant_id + email`
- **Link format:** `https://eldaa.org.nz/professional/apply?token={uuid}`

---

## Google Sheet Structure

```
Sheet: "Professional Applications" (add as new tab or separate sheet)

Columns:
| applicant_id | full_name | email_hash | doc_application | doc_training | doc_ethics | doc_criminal | doc_advance_care | doc_assisted_dying | doc_fundamentals | complete | stripe_session | paid | created_at | paid_at |
```

- `email_hash` = SHA-256 hash of email (for deduplication without storing plaintext)
- `doc_*` columns = timestamp when uploaded, empty if not yet
- `complete` = TRUE when all doc columns filled
- `stripe_session` = checkout session ID when created
- `paid` = TRUE when webhook confirms payment

---

## File Upload to Google Drive

**Folder structure:**
```
/applications/
  └── {applicant_id}/
      ├── application/
      │   └── {random_uuid}.pdf
      ├── training/
      │   └── {random_uuid}.pdf
      ├── ethics/
      │   └── {random_uuid}.pdf
      ├── criminal/
      │   └── {random_uuid}.pdf
      ├── advance_care/
      │   └── {random_uuid}.pdf
      ├── assisted_dying/
      │   └── {random_uuid}.pdf
      └── fundamentals/
          └── {random_uuid}.pdf
```

**Upload process:**
1. Validate file type (PDF, images, docx)
2. Generate random filename
3. Upload to Google Drive via service account
4. Return success → update sheet

---

## API Endpoints

### `GET /api/professional/apply`
- Query param: `?token={resume_token}` (optional)
- If token valid: return applicant status (docs uploaded, remaining)
- If no token: return "new application" flag
- Returns: `{ status: "new" | "partial" | "complete" | "paid", docs_uploaded: [], remaining: [] }`

### `POST /api/professional/register`
- Body: `{ full_name, email }`
- Creates applicant, generates token, sends email
- Returns: `{ success: true, resume_link: "..." }`

### `POST /api/professional/upload/file`
- Body: `multipart/form-data` with file + `doc_type`
- Uploads to Drive, updates sheet
- Returns: `{ success: true, doc_type }`

### `POST /api/professional/upload/complete`
- Checks all docs uploaded
- Creates Stripe checkout session
- Returns: `{ checkout_url }`

---

## Stripe Integration

Uses existing `/api/create-professional-checkout` with:
- `mode=payment`
- `line_items` with first-term amount
- `metadata` with applicant_id, plan, etc.
- Redirects to `/professional/success?session_id=...`

Webhook handles subscription creation (existing flow).

---

## Open Questions

- [x] Resume via unique link (approved)
- [x] Use existing Google Workspace (Gmail API) for sending resume links
- [ ] Should we send email confirmation when all docs uploaded and payment ready?
- [ ] How long should we retain incomplete applications (30 days, 90 days)?
- [ ] Should there be an admin interface for staff to view upload status?
- [ ] What file size limits? (suggest 10MB per file)
- [ ] Should we support .zip uploads for bulk certificates?

---

## Files to Create

```
src/
  pages/
    professional/
      apply.astro             # Main application page (register + upload)
      success-upload.astro    # Shown after payment
      cancel-upload.astro     # Cancel page for this flow
  pages/api/
    professional/
      apply.ts                # GET - check token status, POST - register
      upload-file.ts          # Handle file upload
      upload-complete.ts      # Trigger Stripe checkout
  lib/
    drive-upload.ts           # Google Drive upload helper
    applicant-store.ts        # Server-side applicant data + token management
    upload-sheet.ts          # Sheet update helpers
    email-sender.ts          # Email sending (Gmail API via googleapis)
```
```

---

## Dependencies

- `googleapis` — already in use for Sheets webhook logging
- `uuid` — for applicant_id generation
- Existing Stripe, Sentry, pino logger setup

---

## Out of Scope

- Applicant downloading their own uploads (they don't need this)
- Admin interface to view files (separate authenticated system)
- Email notifications (future enhancement)
- Mobile app or native integrations