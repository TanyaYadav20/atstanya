# Sprint 2 Roadmap: Core ATS & The AI Engine

**Duration**: 1 Week
**Goal**: Build the core ATS tracking components (Candidates & Applications) and integrate Google Gemini to automatically parse resumes and generate match scores against job descriptions.

*(Note: This sprint can run in parallel with Sprint 1 if the team is split, by mocking the Auth/Tenant JWTs locally).*

---

## 1. Core Features to Implement

1. **Candidate & Application Service**
   - Manage candidate profiles (Name, Email, Phone).
   - Create the "Application" pipeline (linking a Candidate to a specific Job).
   - Handle Resume file uploads (PDF/Docx).
2. **AI Analysis Service (The Core USP)**
   - Integrate with the Google Gemini API.
   - Process uploaded resumes.
   - Compare the candidate's resume against the target Job Description.
   - Generate structured insights: **Match Score (0-100)**, **Missing Skills**, and a **Summary**.
3. **Event Pipeline (Synchronous MVP)**
   - Connecting the Candidate Service to the AI Service. When a candidate applies, the AI analysis should trigger automatically.

---

## 2. Libraries & Tech Stack to Learn

### File Handling
* **[Multer](https://github.com/expressjs/multer)**: Node.js middleware for handling `multipart/form-data`. Required for accepting resume uploads from the frontend.
* **[pdf-parse](https://www.npmjs.com/package/pdf-parse)** (Optional): If you need to extract text from PDFs manually before sending it to Gemini, though Gemini 1.5 handles documents natively.

### Artificial Intelligence
* **[@google/generative-ai](https://www.npmjs.com/package/@google/generative-ai)**: The official Node.js SDK for Google Gemini.
  * *Learning Focus: Learn how to force the AI to return strictly formatted **JSON outputs** using `responseMimeType: "application/json"`.*

### Inter-Service Communication
* **[Axios](https://axios-http.com/) / Fetch API**: For the Candidate Service to make internal HTTP calls to the AI Service (for a synchronous MVP). 
* *(Advanced/Optional: If the team finishes early, look into **[BullMQ](https://docs.bullmq.io/)** and Redis to make the AI processing asynchronous, preventing timeouts).*

---

## 3. Actionable Tasks: What Should Be Done

### Days 1-2: Candidates, Applications & File Uploads
- [ ] Initialize the `apps/candidate-service` in Turborepo.
- [ ] Define Mongoose schemas for `Candidate`, `Application`, and `Resume`. (Remember the `tenantId`!).
- [ ] Implement `POST /candidates/apply` endpoint.
- [ ] Integrate `multer` to accept `.pdf` files.
- [ ] For the MVP, save the uploaded files locally to an `/uploads` folder (or AWS S3 if the team is comfortable). Save the file path in the `Resume` collection.

### Day 3: The AI Service
- [ ] Initialize the `apps/ai-service`.
- [ ] Get a Google Gemini API Key and configure the SDK.
- [ ] Write the core AI Prompt. It must accept:
  - `jobDescription` (text)
  - `resumeText` (or the raw PDF document)
- [ ] Enforce a JSON schema output from Gemini:
  ```json
  {
    "matchScore": 85,
    "missingSkills": ["Docker", "Kubernetes"],
    "summary": "Strong frontend candidate, lacks required DevOps experience."
  }
  ```

### Day 4: Tying the Workflow Together
- [ ] Create an internal endpoint in the AI service: `POST /internal/analyze`.
- [ ] Update the `POST /candidates/apply` endpoint in the Candidate Service:
  - After saving the resume file, make an HTTP request to the AI Service's `/internal/analyze` endpoint.
  - Save the AI response into an `AI_Analysis` collection tied to the Application ID.
- [ ] Implement `GET /applications/:id` to return the candidate details *along with* the AI Match Score.

### Day 5: Testing & Review
- [ ] Write unit tests for the Gemini prompt (using mock resumes to ensure the JSON structure doesn't break).
- [ ] Ensure the API Gateway is updated to route `/api/candidates` traffic to the Candidate Service.
