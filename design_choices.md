# ATS Architecture: Design Choices for Senior Review

This document outlines the architectural and workflow design choices for the Multi-Tenant Applicant Tracking System (ATS) module. It is intended for senior engineering review to decide on the technical direction before implementation begins.

---

## 1. Multi-Tenant Data Isolation Strategy

Since this ATS is a B2B SaaS product integrated with our existing HRM, deciding how to isolate client data is the most critical decision.

### Option A: Shared Database, Shared Schema (Logical Isolation)
Every collection (Jobs, Candidates, Resumes) has a `tenantId` field.
* **Pros:**
  * Easiest to maintain and deploy.
  * Simple to run cross-tenant analytics (e.g., total jobs processed system-wide).
  * Highly cost-effective (uses existing DB clusters).
* **Cons:**
  * No physical data isolation; a missing `where tenantId = X` clause could leak data between clients.
  * Noisy neighbor problem (one heavy client slows down others).
* **Recommendation:** **USE** for initial MVP/V1 unless enterprise compliance strictly forbids it. We can mitigate leaks using centralized data-access layers that automatically inject the `tenantId`.

### Option B: Database per Tenant (Physical Isolation)
Each client gets a dynamically provisioned database (e.g., `ats_client_A`, `ats_client_B`).
* **Pros:**
  * Strict data isolation (great for GDPR/compliance).
  * Easy to backup/restore or delete a single client's data.
* **Cons:**
  * Schema migrations are a nightmare (running migrations across 100+ DBs).
  * Connection pooling limits in the backend application.
* **Recommendation:** **DO NOT USE** initially unless mandated by security requirements.

---

## 2. Integration with Existing HRM Frontend

How do we present the ATS module to our existing HRM users?

### Option A: Standalone Portal with SSO (Subdomain)
Users click "ATS" in the HRM and are redirected to `ats.yourdomain.com`, authenticated via SSO (e.g., JWT).
* **Pros:**
  * Clean separation of concerns.
  * ATS UI can be fully optimized for recruitment without being constrained by the HRM's layout.
* **Cons:**
  * Context switch for the user (feels like a separate app).

### Option B: Embedded Micro-Frontend (Iframe or Module Federation)
The ATS is embedded directly inside the HRM dashboard.
* **Pros:**
  * Seamless user experience; feels like a native feature of the HRM.
* **Cons:**
  * High engineering complexity (Webpack Module Federation configuration, CSS conflicts, shared state management).
* **Recommendation:** **USE Option A** for faster time-to-market. Migrate to Option B later if seamless UI is highly requested.

---

## 3. Handling AI Processing (Gemini API)

AI resume parsing and scoring can take a few seconds per resume. How should we handle this in the backend?

### Option A: Synchronous Processing
Candidate uploads resume -> Backend calls Gemini -> Backend waits -> Returns success to Candidate.
* **Pros:**
  * Simple architecture. No extra infrastructure needed.
* **Cons:**
  * High risk of HTTP timeouts if Gemini is slow or if a recruiter bulk-uploads 50 resumes.
  * Blocks the main Node.js event loop if not handled carefully.

### Option B: Asynchronous Processing (Message Queue)
Candidate uploads resume -> Saved to S3 -> Event pushed to Queue (e.g., BullMQ / RabbitMQ / SQS) -> Returns 202 Accepted. A background worker picks up the job, calls Gemini, and updates the database. 
* **Pros:**
  * Highly scalable and resilient. 
  * Easy to handle bulk uploads.
  * If Gemini API goes down, jobs stay in the queue and retry automatically.
* **Cons:**
  * Requires setting up a Queue (Redis/RabbitMQ).
  * Requires WebSockets or Polling on the frontend to notify the user when processing is complete.
* **Recommendation:** **USE Option B**. Given the unpredictable latency of LLMs and the likelihood of bulk resume uploads, an asynchronous queue is mandatory for a production enterprise system.

---

## 4. File Storage for Resumes

### Option A: Database Storage (MongoDB GridFS)
* **Pros:** Everything is in one place. No need for AWS/GCP accounts.
* **Cons:** Bloats the database size rapidly. Slow to serve files.
* **Recommendation:** **DO NOT USE**.

### Option B: Cloud Object Storage (AWS S3, GCP Cloud Storage)
* **Pros:** Infinitely scalable, cheap, built-in security policies, allows generating pre-signed URLs for secure, temporary viewing.
* **Cons:** Requires cloud setup.
* **Recommendation:** **USE**. Industry standard for document storage.

---

## 5. API Architecture

### Option A: REST APIs
* **Pros:** Simple, standard, integrates easily with the existing HRM APIs.
* **Cons:** Prone to over-fetching (e.g., fetching full candidate profiles when the dashboard only needs names and scores).

### Option B: GraphQL
* **Pros:** Frontend can request exactly the data it needs. Great for complex dashboards.
* **Cons:** Steep learning curve, caching is harder, N+1 query problems.
* **Recommendation:** **USE REST** to maintain velocity and consistency with standard backend practices, unless the team is already highly proficient in GraphQL.

---

## Next Steps for Senior Engineering
Please review the above choices and add comments on this document. Specifically, we need sign-off on:
1. Data Isolation Strategy (Logical vs Physical)
2. Frontend Integration (Standalone vs Embedded)
3. AI Processing Architecture (Queue choice: Redis/BullMQ vs cloud-native SQS/PubSub)
